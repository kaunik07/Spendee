import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { StorageMode } from '@/store/storageMode';
import { Colors } from '@/constants/theme';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuthContext();

  const [username, setUsername]               = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [storageMode, setStorageMode]         = useState<StorageMode>('local');
  const [loading, setLoading]                 = useState(false);

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    const { error } = await signUp(username, password, storageMode);
    setLoading(false);
    if (error) Alert.alert('Sign Up Failed', error);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.headerArea}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join Spendee and start tracking</Text>
          </View>

          {/* Storage mode selector */}
          <Text style={styles.sectionLabel}>Where should your data live?</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeCard, storageMode === 'local' && styles.modeCardActive]}
              onPress={() => setStorageMode('local')}
              activeOpacity={0.8}>
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={24}
                color={storageMode === 'local' ? Colors.primary : Colors.outline}
              />
              <Text style={[styles.modeTitle, storageMode === 'local' && styles.modeTitleActive]}>
                Keep it Local
              </Text>
              <Text style={styles.modeDesc}>Stored only on this device. Private, no cloud.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, storageMode === 'online' && styles.modeCardActive]}
              onPress={() => setStorageMode('online')}
              activeOpacity={0.8}>
              <MaterialCommunityIcons
                name="cloud-outline"
                size={24}
                color={storageMode === 'online' ? Colors.primary : Colors.outline}
              />
              <Text style={[styles.modeTitle, storageMode === 'online' && styles.modeTitleActive]}>
                Sync Online
              </Text>
              <Text style={styles.modeDesc}>Backed up to the cloud. Sync across devices.</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Choose a username"
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
                placeholder="Choose a password"
                placeholderTextColor={Colors.outline}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="next"
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

            <Text style={styles.label}>Confirm Password</Text>
            <View style={[styles.passwordWrap, { marginBottom: 24 }]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Repeat your password"
                placeholderTextColor={Colors.outline}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                selectionColor={Colors.primary}
              />
              <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={10}>
                <MaterialCommunityIcons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.outline}
                />
              </Pressable>
            </View>

            <TouchableOpacity
              style={[styles.signupBtn, loading && styles.signupBtnDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.85}>
              <Text style={styles.signupBtnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
            </TouchableOpacity>
          </View>

          {/* Log in link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.loginLink}>Log in</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },

  backBtn: { marginBottom: 24, alignSelf: 'flex-start', padding: 2 },

  headerArea: { marginBottom: 24 },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },

  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  modeRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  modeTitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modeTitleActive: { color: Colors.primary },
  modeDesc: {
    color: Colors.outline,
    fontSize: 11,
    lineHeight: 15,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },

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
    marginBottom: 18,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    color: Colors.text,
    fontSize: 15,
  },

  signupBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signupBtnDisabled: { opacity: 0.5 },
  signupBtnText: { color: Colors.onPrimary, fontSize: 16, fontWeight: '700' },

  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: Colors.textSecondary, fontSize: 14 },
  loginLink: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
