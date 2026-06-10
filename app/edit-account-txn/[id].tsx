import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useAccountTransactions, updateAccountTransactionDirect } from '@/store/useAccountTransactions';
import { Colors } from '@/constants/theme';

const BANK_BLUE     = '#82B1FF';
const DEPOSIT_COLOR = '#82B1FF';
const WITHDRAW_COLOR = '#F2B8B5';

export default function EditAccountTxnScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId: string }>();
  const router = useRouter();

  const { user, storageMode }          = useAuthContext();
  const { accounts, updateAccount }    = useAccountsContext();
  const { transactions }               = useAccountTransactions(accountId, user?.id ?? null, storageMode);

  const txn     = transactions.find((t) => t.id === id);
  const account = accounts.find((a) => a.id === accountId);

  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');

  useEffect(() => {
    if (txn) {
      setAmount(txn.amount.toString());
      setNote(txn.note ?? '');
    }
  }, [txn?.id]);

  const canSave = parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave || !txn || !account || !user?.id) return;
    Keyboard.dismiss();

    const newAmount = parseFloat(amount);
    const diff      = newAmount - txn.amount;

    await updateAccountTransactionDirect(user.id, storageMode, id, { amount: newAmount, note: note.trim() });

    if (diff !== 0) {
      const balanceDelta = txn.type === 'deposit' ? diff : -diff;
      await updateAccount(account.id, account.name, account.balance + balanceDelta);
    }

    router.back();
  };

  if (!txn) return <SafeAreaView style={styles.safe} />;

  const isDeposit = txn.type === 'deposit';
  const typeColor = isDeposit ? DEPOSIT_COLOR : WITHDRAW_COLOR;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Transaction</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.saveBtn, !canSave && { opacity: 0.35 }]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Type badge (read-only) */}
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '50' }]}>
          <MaterialCommunityIcons
            name={isDeposit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
            size={18}
            color={typeColor}
          />
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
            {isDeposit ? 'Deposit' : 'Withdrawal'}
          </Text>
        </View>

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountRow}>
          <Text style={[styles.currencySymbol, { color: typeColor }]}>$</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
            selectionColor={BANK_BLUE}
            placeholder="0.00"
            placeholderTextColor={Colors.outline}
          />
        </View>

        {/* Note */}
        <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={200}
          selectionColor={BANK_BLUE}
          placeholderTextColor={Colors.outline}
          placeholder="Add a note..."
        />

        {/* Account info */}
        {account && (
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="bank-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.infoText}>{account.name} · ${account.balance.toFixed(2)} current balance</Text>
          </View>
        )}

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
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '700' },

  content: { paddingHorizontal: 18, paddingBottom: 48 },

  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 24,
  },
  typeBadgeText: { fontSize: 13, fontWeight: '700' },

  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  currencySymbol: { fontSize: 28, fontWeight: '700' },
  amountInput: {
    color: Colors.text,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'center',
  },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  infoText: { color: Colors.textMuted, fontSize: 12 },
});
