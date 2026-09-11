import 'react-native-url-polyfill/auto'; // must be first import
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useSegments, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { AccountsProvider } from '@/store/AccountsContext';
import { CreditCardsProvider } from '@/store/CreditCardsContext';
import { AuthProvider, useAuthContext } from '@/store/AuthContext';
import { BudgetsProvider } from '@/store/BudgetsContext';
import { TopicsProvider } from '@/store/TopicsContext';
import { TopicExpensesProvider } from '@/store/TopicExpensesContext';
import { ExpenseProvider } from '@/store/ExpenseContext';
import { SavingsProvider } from '@/store/SavingsContext';
import WebLayout from '@/components/web/WebLayout';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ── Biometric lock screen ─────────────────────────────────
function BiometricLockScreen() {
  const { user, unlockWithBiometric, logout } = useAuthContext();

  const handleUnlock = async () => {
    const { error } = await unlockWithBiometric();
    if (error && error !== 'Biometric cancelled') {
      // Biometric failed completely — sign out and go to login
      await logout();
    }
  };

  return (
    <SafeAreaView style={lock.safe}>
      <View style={lock.content}>
        <View style={lock.iconWrap}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={Colors.primary} />
        </View>
        <Text style={lock.title}>Spendee</Text>
        <Text style={lock.subtitle}>Locked — authenticate to continue</Text>

        <TouchableOpacity style={lock.btn} onPress={handleUnlock} activeOpacity={0.85}>
          <MaterialCommunityIcons name="face-recognition" size={22} color={Colors.onPrimary} />
          <Text style={lock.btnText}>Unlock</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={logout} style={lock.logoutLink}>
          <Text style={lock.logoutText}>Log out instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const lock = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: Colors.background },
  content:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  title:      { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:   { color: Colors.textSecondary, fontSize: 14, marginTop: 6, marginBottom: 40, textAlign: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 32,
    marginBottom: 20,
  },
  btnText:    { color: Colors.onPrimary, fontSize: 17, fontWeight: '700' },
  logoutLink: { padding: 8 },
  logoutText: { color: Colors.textSecondary, fontSize: 14 },
});

// ── Auth guard + routing ──────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isGuest, isLoading, requiresBiometric } = useAuthContext();
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthScreen = segments[0] === 'login' || segments[0] === 'signup';

    // Web has no guest mode — a real account is required before any app
    // content shows. Bounce a signed-out web user straight to /login.
    if (Platform.OS === 'web' && !user && !inAuthScreen) {
      router.replace('/login');
      return;
    }

    // Native: the app is always usable as a guest, so there's no auth wall.
    // We only bounce a signed-in (real, non-guest) account away from the
    // login/signup screens — guests may freely visit them to log in or
    // create an account. (On web `isGuest` is never true, so this also
    // covers bouncing a logged-in web user away from /login and /signup.)
    if (user && !isGuest && !requiresBiometric && inAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [user, isGuest, isLoading, requiresBiometric, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (requiresBiometric) return <BiometricLockScreen />;

  // Web: the sidebar shell mounts exactly ONCE here, wrapping every
  // authenticated route (tabs + all root-level screens like profile,
  // settings, account/[id], edit-expense/[id], ...). Each of those
  // .web.tsx screens used to wrap itself in its own <WebLayout> — when
  // navigating from a (tabs) screen to a root-level one, that meant two
  // WebLayout/sidebar instances competing for the same page (the old
  // screen's sidebar left mounted underneath the new one, which doesn't
  // fill the viewport on its own), producing a stray sidebar fragment.
  // A single ancestor instance makes that structurally impossible, and
  // the sidebar no longer remounts/flickers between navigations either.
  // Not applied to login/signup — those render before `user` exists.
  if (Platform.OS === 'web' && user) {
    return <WebLayout>{children}</WebLayout>;
  }

  return <>{children}</>;
}

// ── Root ──────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ExpenseProvider>
          <SavingsProvider>
            <AccountsProvider>
            <CreditCardsProvider>
            <BudgetsProvider>
            <TopicsProvider>
            <TopicExpensesProvider>
              <AuthGuard>
                {/* Native screens navigate with a slide-from-right transition; on
                    web that plays as a visible sliding animation (React Navigation's
                    native-stack supports CSS transitions on web too), which reads as
                    janky/half-rendered on a page load rather than the instant
                    navigation web users expect — so it's turned off there. */}
                <Stack screenOptions={{ animation: Platform.OS === 'web' ? 'none' : 'slide_from_right' }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="login"  options={{ headerShown: false, animation: Platform.OS === 'web' ? 'none' : 'fade' }} />
                  <Stack.Screen name="signup"    options={{ headerShown: false }} />
                  <Stack.Screen name="profile"      options={{ headerShown: false }} />
                  <Stack.Screen name="settings"        options={{ headerShown: false }} />
                  <Stack.Screen name="delete-account"     options={{ headerShown: false }} />
                  <Stack.Screen name="credit-card/[id]"    options={{ headerShown: false }} />
                  <Stack.Screen name="account/[id]"       options={{ headerShown: false }} />
                  <Stack.Screen name="edit-expense/[id]"  options={{ headerShown: false }} />
                  <Stack.Screen name="edit-account-txn/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="edit-cc-txn/[id]"   options={{ headerShown: false }} />
                  <Stack.Screen name="import-statement"   options={{ headerShown: false }} />
                  <Stack.Screen name="topics"              options={{ headerShown: false }} />
                  <Stack.Screen name="topics/[id]"         options={{ headerShown: false }} />
                </Stack>
                <StatusBar style="light" />
              </AuthGuard>
            </TopicExpensesProvider>
            </TopicsProvider>
            </BudgetsProvider>
            </CreditCardsProvider>
            </AccountsProvider>
          </SavingsProvider>
        </ExpenseProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
