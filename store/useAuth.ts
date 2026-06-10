import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode, getStorageMode, setStorageMode } from './storageMode';

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

// ── Hook ─────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser]                           = useState<User | null>(null);
  const [isLoading, setIsLoading]                 = useState(true);
  const [lastUser, setLastUser]                   = useState<User | null>(null);
  const [requiresBiometric, setRequiresBiometric] = useState(false);
  const [storageMode, setMode]                    = useState<StorageMode | null>(null);

  // ── Init ────────────────────────────────────────────────
  useEffect(() => {
    // Handle local mode separately (no Supabase auth involved)
    (async () => {
      const mode = await getStorageMode();
      setMode(mode);

      if (mode === 'local') {
        const sessionRaw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
        if (sessionRaw) {
          const { userId } = JSON.parse(sessionRaw);
          const users = await localGetUsers();
          const found = users.find((u) => u.id === userId);
          if (found) {
            const u: User = { id: found.id, username: found.username, biometricEnabled: found.biometricEnabled, createdAt: found.createdAt };
            setUser(u);
            await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(u));
            if (found.biometricEnabled) setRequiresBiometric(true);
          }
        } else {
          const raw = await SecureStore.getItemAsync(LAST_USER_KEY);
          if (raw) setLastUser(JSON.parse(raw));
        }
        setIsLoading(false);
      }
      // Online mode: isLoading is set to false inside onAuthStateChange via INITIAL_SESSION
    })();

    // For online mode, use onAuthStateChange as the single source of truth.
    // INITIAL_SESSION fires once AsyncStorage has been read — this is more
    // reliable than getSession() on Android where storage reads can be slow.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          try {
            const mode = await getStorageMode();
            if (mode === 'local') return; // local mode handled above
            if (session) {
              const profile = await fetchProfile(session.user.id);
              if (profile) {
                setUser(profile);
                await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(profile));
                if (profile.biometricEnabled) setRequiresBiometric(true);
              }
            } else {
              const raw = await SecureStore.getItemAsync(LAST_USER_KEY);
              if (raw) setLastUser(JSON.parse(raw));
            }
          } catch (_) {
            // init failed — still unblock the UI
          } finally {
            setIsLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setRequiresBiometric(false);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          const profile = await fetchProfile(session.user.id);
          if (profile) setUser(profile);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── Sign up ─────────────────────────────────────────────
  const signUp = useCallback(async (
    username: string,
    password: string,
    mode: StorageMode,
  ): Promise<{ error?: string }> => {
    const trimmed = username.trim();
    if (!trimmed || !password) return { error: 'All fields are required' };
    if (trimmed.length < 3)    return { error: 'Username must be at least 3 characters' };
    if (password.length < 4)   return { error: 'Password must be at least 4 characters' };

    await setStorageMode(mode);
    setMode(mode);

    if (mode === 'local') {
      const users = await localGetUsers();
      if (users.find((u) => u.username.toLowerCase() === trimmed.toLowerCase())) {
        return { error: 'Username already taken' };
      }
      const id           = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const passwordHash = await localHashPassword(trimmed, password);
      const createdAt    = new Date().toISOString();
      const newLocalUser: LocalUser = { id, username: trimmed, passwordHash, biometricEnabled: false, createdAt };
      await localSaveUsers([...users, newLocalUser]);
      await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: id }));
      const newUser: User = { id, username: trimmed, biometricEnabled: false, createdAt };
      setUser(newUser);
      setLastUser(newUser);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(newUser));
      return {};
    } else {
      // Online — DB trigger creates the profile automatically
      const { data, error } = await supabase.auth.signUp({ email: toEmail(trimmed), password });
      if (error) {
        if (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already been registered')) {
          return { error: 'Username already taken' };
        }
        return { error: error.message };
      }
      if (!data.user) return { error: 'Sign up failed, please try again' };
      const newUser: User = { id: data.user.id, username: trimmed, biometricEnabled: false, createdAt: data.user.created_at };
      setUser(newUser);
      setLastUser(newUser);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(newUser));
      return {};
    }
  }, []);

  // ── Login ────────────────────────────────────────────────
  const login = useCallback(async (
    username: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const trimmed = username.trim();
    if (!trimmed || !password) return { error: 'All fields are required' };

    const mode = await getStorageMode();

    if (mode === 'local') {
      const users = await localGetUsers();
      const found = users.find((u) => u.username.toLowerCase() === trimmed.toLowerCase());
      if (!found) return { error: 'Invalid username or password' };
      const hash = await localHashPassword(trimmed, password);
      if (hash !== found.passwordHash) return { error: 'Invalid username or password' };
      await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: found.id }));
      const u: User = { id: found.id, username: found.username, biometricEnabled: found.biometricEnabled, createdAt: found.createdAt };
      setUser(u);
      setLastUser(u);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(u));
      return {};
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: toEmail(trimmed), password });
      if (error || !data.user) return { error: 'Invalid username or password' };
      const profile = await fetchProfile(data.user.id);
      if (!profile) return { error: 'Profile not found' };
      setUser(profile);
      setLastUser(profile);
      await SecureStore.setItemAsync(LAST_USER_KEY, JSON.stringify(profile));
      return {};
    }
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
  const logout = useCallback(async () => {
    const mode = await getStorageMode();
    if (mode === 'local') {
      if (user?.biometricEnabled) {
        await SecureStore.setItemAsync(LOCAL_BIO_USER_KEY, user.id);
      } else {
        await SecureStore.deleteItemAsync(LOCAL_BIO_USER_KEY);
      }
      await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
    } else {
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
    setUser(null);
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

    setUser(null);
    setLastUser(null);
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
      if (mode === 'local') await SecureStore.deleteItemAsync(LOCAL_BIO_USER_KEY);
      else await SecureStore.deleteItemAsync(BIO_SESSION_KEY);
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

  return {
    user,
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
  };
}
