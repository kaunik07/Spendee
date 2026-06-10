import 'react-native-url-polyfill/auto'; // must be first import
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useSegments, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { AccountsProvider } from '@/store/AccountsContext';
import { CreditCardsProvider } from '@/store/CreditCardsContext';
import { AuthProvider, useAuthContext } from '@/store/AuthContext';
import { ExpenseProvider } from '@/store/ExpenseContext';
import { InvestmentsProvider } from '@/store/InvestmentsContext';
import { SavingsProvider } from '@/store/SavingsContext';
import { TripsProvider } from '@/store/TripsContext';

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
  const { user, isLoading, requiresBiometric } = useAuthContext();
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthScreen = segments[0] === 'login' || segments[0] === 'signup';

    if (!user && !requiresBiometric && !inAuthScreen) {
      router.replace('/login');
    } else if ((user || requiresBiometric) && inAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, requiresBiometric, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (requiresBiometric) return <BiometricLockScreen />;

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
            <InvestmentsProvider>
            <TripsProvider>
              <AuthGuard>
                <Stack>
                  <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
                  <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="login"     options={{ headerShown: false, animation: 'fade' }} />
                  <Stack.Screen name="signup"    options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="profile"      options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="settings"        options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="delete-account"     options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="credit-card/[id]"    options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="account/[id]"       options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="edit-expense/[id]"  options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="edit-account-txn/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="edit-cc-txn/[id]"   options={{ headerShown: false, animation: 'slide_from_right' }} />
                </Stack>
                <StatusBar style="light" />
              </AuthGuard>
            </TripsProvider>
            </InvestmentsProvider>
            </CreditCardsProvider>
            </AccountsProvider>
          </SavingsProvider>
        </ExpenseProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
