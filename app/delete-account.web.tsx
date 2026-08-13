// Web override of Delete Account. Stays a full page rather than a drawer —
// it's a deliberate, destructive confirmation flow, not an inline edit — but
// laid out for the web shell (capped width, centered, web-scale type) instead
// of the mobile screen's full-bleed layout with a bottom-anchored footer.
//
// Also fixes a silent failure: the mobile screen reports errors with
// Alert.alert, which is a no-op on react-native-web, so a failed delete would
// have shown the user nothing at all. This uses an inline error banner.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/store/AuthContext';

const DISCLAIMERS = [
  'Your account will be permanently deleted',
  'All your expenses and transactions will be erased',
  'Your accounts and balances will be removed',
  'Your savings goals will be deleted',
  'You will not be able to recover any of this data',
];

export default function DeleteAccountScreenWeb() {
  const router = useRouter();
  const { deleteAccount } = useAuthContext();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (typeof window !== 'undefined' &&
        !window.confirm('Permanently delete your account and all its data? This cannot be undone.')) return;
    setError(null);
    setDeleting(true);
    const { error: err } = await deleteAccount();
    setDeleting(false);
    if (err) setError(err);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.outline} />
        </Pressable>
        <Text style={styles.pageTitle}>Delete Account</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={Colors.danger} />
        </View>

        <Text style={styles.title}>Are you absolutely sure?</Text>
        <Text style={styles.subtitle}>This action is permanent and cannot be undone.</Text>

        <View style={styles.disclaimerCard}>
          {DISCLAIMERS.map((item, i) => (
            <View key={item} style={[styles.disclaimerRow, i > 0 && styles.disclaimerRowBorder]}>
              <MaterialCommunityIcons name="close-circle-outline" size={15} color={Colors.danger} style={{ marginTop: 1 }} />
              <Text style={styles.disclaimerText}>{item}</Text>
            </View>
          ))}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-outline" size={15} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.note}>If you just want a fresh start, consider logging out instead.</Text>

        <Pressable
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}>
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="delete-forever-outline" size={19} color="#fff" />
              <Text style={styles.deleteBtnText}>Permanently Delete My Account</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel, keep my account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: 560 },

  topbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { marginRight: 10 },
  pageTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' },

  card: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },

  iconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: Colors.danger + '18',
    borderWidth: 1, borderColor: Colors.danger + '30',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },

  title: { color: Colors.text, fontSize: 19, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  subtitle: { color: Colors.textSecondary, fontSize: 13.5, textAlign: 'center', marginBottom: 24 },

  disclaimerCard: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 18,
  },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 15, paddingVertical: 11 },
  disclaimerRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  disclaimerText: { color: Colors.textSecondary, fontSize: 12.5, flex: 1, lineHeight: 18 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%',
    backgroundColor: Colors.danger + '18', borderWidth: 1, borderColor: Colors.danger + '40',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  errorText: { color: Colors.danger, fontSize: 12.5, fontWeight: '600', flex: 1 },

  note: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 22 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: Colors.danger, borderRadius: 16, paddingVertical: 15, width: '100%',
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },

  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: Colors.textSecondary, fontSize: 13.5 },
});
