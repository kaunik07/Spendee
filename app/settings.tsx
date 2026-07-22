import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '@/store/AuthContext';
import { Colors } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isGuest, toggleBiometric, logout } = useAuthContext();

  const [biometricType, setBiometricType]           = useState<'face' | 'fingerprint' | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [toggling, setToggling]                     = useState(false);

  useEffect(() => {
    (async () => {
      const [supported, enrolled, types] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      setBiometricAvailable(supported && enrolled);
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('face');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  const handleToggleBiometric = async () => {
    setToggling(true);
    const { error } = await toggleBiometric();
    setToggling(false);
    if (error && error !== 'Cancelled') Alert.alert('Error', error);
  };

  if (!user) return null;

  const biometricLabel = biometricType === 'face'
    ? 'Face ID'
    : biometricType === 'fingerprint'
    ? 'Fingerprint'
    : 'Biometric Login';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Security — only for real accounts (guests have no lock) */}
        {!isGuest && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Security</Text>

          {biometricAvailable ? (
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: Colors.primaryMuted }]}>
                  <MaterialCommunityIcons
                    name={biometricType === 'face' ? 'face-recognition' : 'fingerprint'}
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View>
                  <Text style={styles.settingTitle}>{biometricLabel}</Text>
                  <Text style={styles.settingSubtitle}>
                    {user.biometricEnabled ? 'Tap to disable' : 'Tap to enable quick login'}
                  </Text>
                </View>
              </View>
              <Switch
                value={user.biometricEnabled}
                onValueChange={handleToggleBiometric}
                disabled={toggling}
                trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
                thumbColor={user.biometricEnabled ? Colors.primary : Colors.outline}
              />
            </View>
          ) : (
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: Colors.surfaceContainer }]}>
                  <MaterialCommunityIcons name="fingerprint" size={20} color={Colors.outline} />
                </View>
                <View>
                  <Text style={[styles.settingTitle, { color: Colors.textMuted }]}>Biometric Login</Text>
                  <Text style={styles.settingSubtitle}>Not available on this device</Text>
                </View>
              </View>
            </View>
          )}
        </View>
        )}

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>

          {isGuest ? (
            <>
              <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/signup')} activeOpacity={0.75}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: Colors.primaryMuted }]}>
                    <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.settingTitle}>Back up to cloud</Text>
                    <Text style={styles.settingSubtitle}>Create an account to sync across devices</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>

              <View style={{ height: 10 }} />

              <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/login')} activeOpacity={0.75}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: Colors.surfaceContainer }]}>
                    <MaterialCommunityIcons name="login" size={20} color={Colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={styles.settingTitle}>Log in</Text>
                    <Text style={styles.settingSubtitle}>Already have an account?</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.settingRow} onPress={handleLogout} activeOpacity={0.75}>
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: Colors.danger + '18' }]}>
                    <MaterialCommunityIcons name="logout" size={20} color={Colors.danger} />
                  </View>
                  <View>
                    <Text style={[styles.settingTitle, { color: Colors.danger }]}>Log Out</Text>
                    <Text style={styles.settingSubtitle}>Sign out of your account</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.outline} />
              </TouchableOpacity>

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={styles.deleteRow}
                onPress={() => router.push('/delete-account')}
                activeOpacity={0.75}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.settingIcon, { backgroundColor: Colors.danger + '18' }]}>
                    <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.danger} />
                  </View>
                  <View>
                    <Text style={[styles.settingTitle, { color: Colors.danger }]}>Delete Account</Text>
                    <Text style={styles.settingSubtitle}>Permanently remove all data</Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { padding: 2 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },

  content: { paddingHorizontal: 18, paddingBottom: 48 },

  section: { marginBottom: 24 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingLeft:     { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
  },
  settingIcon:     { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingTitle:    { color: Colors.text, fontSize: 15, fontWeight: '600' },
  settingSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
});
