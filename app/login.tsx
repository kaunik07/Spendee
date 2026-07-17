import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '@/store/AuthContext';
import { Colors } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithBiometric, lastUser, requiresBiometric } = useAuthContext();

  const [username, setUsername]           = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);

  // Detect what biometric type is available and whether last user has it enabled
  useEffect(() => {
    if (!lastUser?.biometricEnabled) return;
    (async () => {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }
    })();
  }, [lastUser]);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await login(username, password);
    setLoading(false);
    if (error) Alert.alert('Login Failed', error);
  };

  const handleBiometric = async () => {
    const { error } = await loginWithBiometric();
    if (error && error !== 'Biometric cancelled') {
      Alert.alert('Error', error);
    }
  };

  const showBiometric = lastUser?.biometricEnabled && biometricType !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoIcon}>
              <MaterialCommunityIcons name="wallet-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.appName}>Spendee</Text>
            <Text style={styles.tagline}>Your personal expense tracker</Text>
          </View>

          {/* Biometric quick login */}
          {showBiometric && (
            <TouchableOpacity style={styles.biometricCard} onPress={handleBiometric} activeOpacity={0.8}>
              <MaterialCommunityIcons
                name={biometricType === 'face' ? 'face-recognition' : 'fingerprint'}
                size={28}
                color={Colors.primary}
              />
              <View style={styles.biometricText}>
                <Text style={styles.biometricTitle}>
                  {biometricType === 'face' ? 'Face ID' : 'Fingerprint'}
                </Text>
                <Text style={styles.biometricSub}>Continue as {lastUser!.username}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
            </TouchableOpacity>
          )}

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back</Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor={Colors.outline}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              selectionColor={Colors.primary}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor={Colors.outline}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                selectionColor={Colors.primary}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.outline}
                />
              </Pressable>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}>
              <Text style={styles.loginBtnText}>{loading ? 'Logging in…' : 'Log In'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign up link */}
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.signupLink}>Sign up</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },

  logoArea: { alignItems: 'center', paddingTop: 32, paddingBottom: 36 },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  appName: { color: Colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },

  biometricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    gap: 14,
  },
  biometricText: { flex: 1 },
  biometricTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  biometricSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 22 },

  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    color: Colors.text,
    fontSize: 15,
  },

  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: Colors.onPrimary, fontSize: 16, fontWeight: '700' },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  signupText: { color: Colors.textSecondary, fontSize: 14 },
  signupLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
