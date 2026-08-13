// Web override of Settings. Biometric section is omitted entirely (never
// available on web — see Phase A gating in useAuth.ts); guest branches are
// omitted too (guest mode is skipped on web, a real account is required).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebLayout from '@/components/web/WebLayout';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/store/AuthContext';

export default function SettingsScreenWeb() {
  const router = useRouter();
  const { user, logout } = useAuthContext();
  if (!user) return null;

  const handleLogout = () => {
    if (typeof window !== 'undefined' && !window.confirm('Log out of your account?')) return;
    logout();
  };

  return (
    <WebLayout>
    <View>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>Manage your account</Text>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.cardRow}>
        <Pressable style={styles.card} onPress={handleLogout}>
          <View style={[styles.cardIcon, { backgroundColor: Colors.danger + '18' }]}>
            <MaterialCommunityIcons name="logout" size={20} color={Colors.danger} />
          </View>
          <Text style={[styles.cardTitle, { color: Colors.danger }]}>Log Out</Text>
          <Text style={styles.cardSub}>Sign out of your account</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push('/delete-account')}>
          <View style={[styles.cardIcon, { backgroundColor: Colors.danger + '18' }]}>
            <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.danger} />
          </View>
          <Text style={[styles.cardTitle, { color: Colors.danger }]}>Delete Account</Text>
          <Text style={styles.cardSub}>Permanently remove all data</Text>
        </Pressable>
      </View>
    </View>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2 },

  sectionLabel: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', gap: 16 },
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
  },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 4 },
});
