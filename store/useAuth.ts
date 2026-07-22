import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode, getStorageMode, setStorageMode, clearStorageMode } from './storageMode';
import { migrateLocalDataToCloud } from './migrateToCloud';

export interface User {
  id: string;
  username: string;
  biometricEnabled: boolean;
  createdAt: string;
}

// ── Storage keys ──────────────────────────────────────────
// Local mode
const LOCAL_USERS_KEY   = '@spendee_local_users';
const LOCAL_SESSION_KEY = '@spendee_local_session';
const LOCAL_BIO_USER_KEY = 'spendee_bio_local_userId'; // SecureStore

// Online mode — split into two keys so each stays under the 2048-byte SecureStore limit
const BIO_ACCESS_KEY  = 'spendee_bio_access';          // SecureStore
const BIO_REFRESH_KEY = 'spendee_bio_refresh';         // SecureStore

// Shared
const LAST_USER_KEY = 'spendee_last_user';             // SecureStore

// ── Local helpers ─────────────────────────────────────────
interface LocalUser {
  id: string;
  username: string;
  passwordHash: string;
  biometricEnabled: boolean;
  createdAt: string;
}

async function localGetUsers(): Promise<LocalUser[]> {
  const raw = await AsyncStorage.getItem(LOCAL_USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function localSaveUsers(users: LocalUser[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

async function localHashPassword(username: string, password: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${username.toLowerCase()}:${password}:spendee_local_v1`
  );
}

// ── Supabase helpers ──────────────────────────────────────
function toEmail(username: string) {
  return `${username.trim().toLowerCase()}@spendee.app`;
}

async function fetchProfile(userId: string): Promise<User | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, biometric_enabled, created_at')
    .eq('id', userId)
    .single();
  if (!data) return null;
  return {
    id:               data.id,
    username:         data.username,
    biometricEnabled: data.biometric_enabled,
    createdAt:        data.created_at,
  };
}

// ── Guest (no-account, on-device) ─────────────────────────
function toUser(u: LocalUser): User {
  return { id: u.id, username: u.username, biometricEnabled: u.biometricEnabled, createdAt: u.createdAt };
}

// Find or create the single on-device guest user and make it the active
// local session. Guest ids are prefixed `guest_` so they're distinguishable.
async function ensureGuestUser(): Promise<User> {
  const users = await localGetUsers();
  let guest = users.find((u) => u.id.startsWith('guest_'));
  if (!guest) {
    guest = {
      id: `guest_${Crypto.randomUUID()}`,
      username: 'Guest',
      passwordHash: '',
      biometricEnabled: false,
      createdAt: new Date().toISOString(),
    };
    await localSaveUsers([...users, guest]);
  }
  await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: guest.id }));
  await setStorageMode('local');
  return toUser(guest);
}

// ── Hook ─────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser]                           = useState<User | null>(null);
  const [isLoading, setIsLoading]                 = useState(true);
  const [lastUser, setLastUser]                   = useState<User | null>(null);
  const [requiresBiometric, setRequiresBiometric] = useState(false);
  const [storageMode, setMode]                    = useState<StorageMode | null>(null);

  // ── Init ────────────────────────────────────────────────
  // Resolve to exactly one usable session: an online account if a valid
  // Supabase session exists, otherwise the on-device guest (resumed or fresh).
  // The app is therefore always usable — there is no auth wall.
  useEffect(() => {
    let active = true;
    const safetyTimer = setTimeout(() => { if (active) setIsLoading(false); }, 6000);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const profile = await fetchProfile(session.user.id);
          if (profile) {
            await setStorageMode('online');
            if (!active) return;
            setMode('online');
            setUser(profile);
            setLastUser(profile);
            await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(profile));
            if (profile.biometricEnabled) setRequiresBiometric(true);
            return;
          }
          // Session points at a deleted account — drop it and fall to guest.
          await supabase.auth.signOut();
        }

        // No online session → resume the local/guest session, or create a guest.
        const mode = await getStorageMode();
        const sessionRaw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
        if (mode === 'local' && sessionRaw) {
          const { userId } = JSON.parse(sessionRaw);
          const found = (await localGetUsers()).find((u) => u.id === userId);
          if (found) {
            if (!active) return;
            setMode('local');
            setUser(toUser(found));
            await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(toUser(found)));
            // Only real (password) local accounts use biometric; guests don't.
            if (found.biometricEnabled && !found.id.startsWith('guest_')) setRequiresBiometric(true);
            return;
          }
        }

        const guest = await ensureGuestUser();
        if (!active) return;
        setMode('local');
        setUser(guest);
      } catch (_) {
        try {
          const guest = await ensureGuestUser();
          if (active) { setMode('local'); setUser(guest); }
        } catch { /* give up — safety timer unblocks the UI */ }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    // Keep the session token fresh in the background.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        const profile = await fetchProfile(session.user.id);
        if (profile) setUser(profile);
      }
    });

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  // ── Create account (also backs up a guest to the cloud) ──
  // Always creates an online account. If the current session is a guest, its
  // on-device data is migrated up into the new account.
  const signUp = useCallback(async (
    username: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const trimmed = username.trim();
    if (!trimmed || !password) return { error: 'All fields are required' };
    if (trimmed.length < 3)    return { error: 'Username must be at least 3 characters' };
    // Username becomes the local part of a synthetic email (user@spendee.app),
    // so it must be email-safe.
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      return { error: 'Username can only contain letters, numbers, dots, dashes and underscores' };
    }
    if (password.length < 4)   return { error: 'Password must be at least 4 characters' };

    const { data, error } = await supabase.auth.signUp({ email: toEmail(trimmed), password });
    if (error) {
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered')) {
        return { error: 'Username already taken' };
      }
      return { error: error.message };
    }
    if (!data.user) return { error: 'Sign up failed, please try again' };

    // Back up the guest's on-device data into the fresh cloud account.
    if (user?.id.startsWith('guest_')) {
      const mig = await migrateLocalDataToCloud(user.id, data.user.id);
      if (mig.error) console.warn('[signUp] data migration:', mig.error);
    }

    await setStorageMode('online');
    setMode('online');
    // The DB trigger stores the lowercased email local part — mirror that here.
    const newUser: User = { id: data.user.id, username: trimmed.toLowerCase(), biometricEnabled: false, createdAt: data.user.created_at };
    setUser(newUser);
    setLastUser(newUser);
    await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(newUser));
    return {};
  }, [user]);

  // ── Login (existing cloud account) ────────────────────────
  // Switches to the account; any on-device guest data is left untouched.
  const login = useCallback(async (
    username: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const trimmed = username.trim();
    if (!trimmed || !password) return { error: 'All fields are required' };

    const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(trimmed), password });
    if (error || !data.user) return { error: 'Invalid username or password' };
    const profile = await fetchProfile(data.user.id);
    if (!profile) return { error: 'Profile not found' };
    await setStorageMode('online');
    setMode('online');
    setUser(profile);
    setLastUser(profile);
    await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(profile));
    return {};
  }, []);

  // ── Biometric unlock (lock screen — session still active) ─
  const unlockWithBiometric = useCallback(async (): Promise<{ error?: string }> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Spendee',
      cancelLabel:   'Use Password',
      fallbackLabel: 'Use Password',
    });
    if (!result.success) return { error: 'Biometric cancelled' };
    setRequiresBiometric(false);
    return {};
  }, []);

  // ── Biometric re-login (after explicit logout) ────────────
  const loginWithBiometric = useCallback(async (): Promise<{ error?: string }> => {
    const mode = await getStorageMode();

    if (mode === 'local') {
      const savedId = await SecureStore.getItemAsync(LOCAL_BIO_USER_KEY);
      if (!savedId) return { error: 'No saved session for biometric login' };
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in to Spendee',
        cancelLabel:   'Use Password',
        fallbackLabel: 'Use Password',
      });
      if (!result.success) return { error: 'Biometric cancelled' };
      const users = await localGetUsers();
      const found = users.find((u) => u.id === savedId);
      if (!found || !found.biometricEnabled) return { error: 'Biometric not enabled' };
      await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: found.id }));
      const u: User = { id: found.id, username: found.username, biometricEnabled: found.biometricEnabled, createdAt: found.createdAt };
      setUser(u);
      setLastUser(u);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(u));
      return {};
    } else {
      const accessToken  = await SecureStore.getItemAsync(BIO_ACCESS_KEY);
      const refreshToken = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
      if (!accessToken || !refreshToken) return { error: 'No saved session for biometric login' };
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in to Spendee',
        cancelLabel:   'Use Password',
        fallbackLabel: 'Use Password',
      });
      if (!result.success) return { error: 'Biometric cancelled' };
      const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error || !data.session) {
        await SecureStore.deleteItemAsync(BIO_ACCESS_KEY);
        await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
        return { error: 'Session expired — please log in with your password' };
      }
      const profile = await fetchProfile(data.session.user.id);
      if (!profile) return { error: 'Profile not found' };
      setUser(profile);
      setLastUser(profile);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(profile));
      return {};
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────
  // Signs out of the cloud account and drops back to a fresh guest session,
  // so the app stays usable. On-device guest data (if any) is left intact.
  const logout = useCallback(async () => {
    const mode = await getStorageMode();
    if (mode === 'online') {
      if (user?.biometricEnabled) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await SecureStore.setItemAsync(BIO_ACCESS_KEY,  session.access_token);
          await SecureStore.setItemAsync(BIO_REFRESH_KEY, session.refresh_token);
        }
      } else {
        await SecureStore.deleteItemAsync(BIO_ACCESS_KEY);
        await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
      }
      await supabase.auth.signOut();
    }
    const guest = await ensureGuestUser();
    setUser(guest);
    setMode('local');
    setRequiresBiometric(false);
  }, [user]);

  // ── Delete account ───────────────────────────────────────
  const deleteAccount = useCallback(async (): Promise<{ error?: string }> => {
    if (!user) return { error: 'Not logged in' };
    const mode = await getStorageMode();

    if (mode === 'local') {
      const userId = user.id;
      // Remove all user data
      await Promise.all([
        AsyncStorage.removeItem(`@spendee_expenses_${userId}`),
        AsyncStorage.removeItem(`@spendee_accounts_${userId}`),
        AsyncStorage.removeItem(`@spendee_savings_${userId}`),
        AsyncStorage.removeItem(`@spendee_trips_${userId}`),
        AsyncStorage.removeItem(`@spendee_account_txns_${userId}`),
        AsyncStorage.removeItem(`@spendee_credit_cards_${userId}`),
        AsyncStorage.removeItem(`@spendee_cc_txns_${userId}`),
        AsyncStorage.removeItem(`@spendee_budgets_${userId}`),
        AsyncStorage.removeItem(`@spendee_default_payment_${userId}`),
        AsyncStorage.removeItem(LOCAL_SESSION_KEY),
      ]);
      // Remove user from users list
      const users = await localGetUsers();
      await localSaveUsers(users.filter((u) => u.id !== userId));
      // Clean up SecureStore
      await Promise.all([
        SecureStore.deleteItemAsync(LOCAL_BIO_USER_KEY),
        SecureStore.deleteItemAsync(LAST_USER_KEY),
      ]);
    } else {
      // Online mode — delete Supabase auth user via RPC (requires a DB function)
      const { error } = await supabase.rpc('delete_user');
      if (error) return { error: error.message };
      await Promise.all([
        SecureStore.deleteItemAsync(BIO_ACCESS_KEY),
        SecureStore.deleteItemAsync(BIO_REFRESH_KEY),
        SecureStore.deleteItemAsync(LAST_USER_KEY),
      ]);
      await supabase.auth.signOut();
    }

    // Return to a fresh guest session so the app stays usable.
    const guest = await ensureGuestUser();
    setUser(guest);
    setLastUser(null);
    setMode('local');
    setRequiresBiometric(false);
    return {};
  }, [user]);

  // ── Toggle biometric ──────────────────────────────────────
  const toggleBiometric = useCallback(async (): Promise<{ error?: string }> => {
    if (!user) return { error: 'Not logged in' };

    if (!user.biometricEnabled) {
      const [supported, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!supported || !enrolled) {
        return { error: 'No biometrics enrolled on this device. Set up Face ID or fingerprint in Settings first.' };
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable biometric login' });
      if (!result.success) return { error: 'Cancelled' };
    } else {
      const mode = await getStorageMode();
      if (mode === 'local') {
        await SecureStore.deleteItemAsync(LOCAL_BIO_USER_KEY);
      } else {
        await SecureStore.deleteItemAsync(BIO_ACCESS_KEY);
        await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
      }
    }

    const newValue = !user.biometricEnabled;
    const mode = await getStorageMode();

    if (mode === 'local') {
      const users = await localGetUsers();
      const updated = users.map((u) => u.id === user.id ? { ...u, biometricEnabled: newValue } : u);
      await localSaveUsers(updated);
    } else {
      const { error } = await supabase.from('profiles').update({ biometric_enabled: newValue }).eq('id', user.id);
      if (error) return { error: error.message };
    }

    const updatedUser = { ...user, biometricEnabled: newValue };
    setUser(updatedUser);
    setLastUser(updatedUser);
    await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(updatedUser));
    return {};
  }, [user]);

  // ── Forget this device ─────────────────────────────────────
  // Escape hatch for a stuck login: wipes every cached local account,
  // cached session, and biometric token on this device, and signs out
  // of Supabase. Local mode never talks to the backend, so nothing done
  // server-side (e.g. deleting users in the database) can ever clear a
  // stale local session on its own — this is the only way to clear it.
  // Does not touch per-user app data (expenses, etc.); those simply
  // become unreachable once their account no longer exists anywhere.
  const forgetDevice = useCallback(async (): Promise<void> => {
    await Promise.all([
      AsyncStorage.removeItem(LOCAL_USERS_KEY),
      AsyncStorage.removeItem(LOCAL_SESSION_KEY),
      clearStorageMode(),
      SecureStore.deleteItemAsync(LOCAL_BIO_USER_KEY),
      SecureStore.deleteItemAsync(BIO_ACCESS_KEY),
      SecureStore.deleteItemAsync(BIO_REFRESH_KEY),
      SecureStore.deleteItemAsync(LAST_USER_KEY),
    ]);
    try { await supabase.auth.signOut(); } catch { /* no session to sign out of */ }
    // Land on a fresh guest so the app stays usable after a reset.
    const guest = await ensureGuestUser();
    setUser(guest);
    setLastUser(null);
    setRequiresBiometric(false);
    setMode('local');
  }, []);

  const isGuest = (user?.id ?? '').startsWith('guest_');

  return {
    user,
    isGuest,
    isLoading,
    lastUser,
    requiresBiometric,
    storageMode,
    signUp,
    login,
    loginWithBiometric,
    unlockWithBiometric,
    logout,
    toggleBiometric,
    deleteAccount,
    forgetDevice,
  };
}
