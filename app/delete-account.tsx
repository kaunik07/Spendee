import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '@/store/AuthContext';
import { Colors } from '@/constants/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { deleteAccount } = useAuthContext();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) Alert.alert('Error', error);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Warning icon */}
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={52} color={Colors.danger} />
        </View>

        <Text style={styles.title}>Are you absolutely sure?</Text>
        <Text style={styles.subtitle}>
          This action is permanent and cannot be undone.
        </Text>

        {/* Disclaimer items */}
        <View style={styles.disclaimerCard}>
          {[
            'Your account will be permanently deleted',
            'All your expenses and transactions will be erased',
            'Your accounts and balances will be removed',
            'Your savings goals will be deleted',
            'Your trips and trip expenses will be lost',
            'You will not be able to recover any of this data',
          ].map((item, i) => (
            <View key={i} style={[styles.disclaimerRow, i > 0 && styles.disclaimerRowBorder]}>
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={Colors.danger} style={{ marginTop: 1 }} />
              <Text style={styles.disclaimerText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          If you just want a fresh start, consider logging out instead.
        </Text>
      </ScrollView>

      {/* Bottom delete button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.8}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="delete-forever-outline" size={20} color="#fff" />
              <Text style={styles.deleteBtnText}>Permanently Delete My Account</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel, keep my account</Text>
        </TouchableOpacity>
      </View>
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
  backBtn:     { padding: 2 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },

  content: { paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.danger + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },

  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },

  disclaimerCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    overflow: 'hidden',
    marginBottom: 20,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  disclaimerRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  disclaimerText: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  note: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 12,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.danger,
    borderRadius: 18,
    paddingVertical: 16,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: Colors.textSecondary, fontSize: 14 },
});
