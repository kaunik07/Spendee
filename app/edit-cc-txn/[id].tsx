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
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useCreditCardTransactions, updateCCTransactionDirect } from '@/store/useCreditCardTransactions';
import { Colors } from '@/constants/theme';

const CARD_COLOR    = '#E8906A';
const CHARGE_COLOR  = '#F2B8B5';
const PAYMENT_COLOR = '#A8EDBB';

export default function EditCCTxnScreen() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId: string }>();
  const router = useRouter();

  const { user, storageMode }         = useAuthContext();
  const { cards, updateCard }         = useCreditCardsContext();
  const { transactions }              = useCreditCardTransactions(cardId, user?.id ?? null, storageMode);

  const txn  = transactions.find((t) => t.id === id);
  const card = cards.find((c) => c.id === cardId);

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
    if (!canSave || !txn || !card || !user?.id) return;
    Keyboard.dismiss();

    const newAmount = parseFloat(amount);
    const diff      = newAmount - txn.amount;

    await updateCCTransactionDirect(user.id, storageMode, id, { amount: newAmount, note: note.trim() });

    if (diff !== 0) {
      // charge increases outstanding; payment decreases it — reverse for the diff
      const outstandingDelta = txn.type === 'charge' ? diff : -diff;
      await updateCard(card.id, card.name, card.outstandingBalance + outstandingDelta, card.creditLimit);
    }

    router.back();
  };

  if (!txn) return <SafeAreaView style={styles.safe} />;

  const isCharge  = txn.type === 'charge';
  const typeColor = isCharge ? CHARGE_COLOR : PAYMENT_COLOR;

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
            name={isCharge ? 'credit-card-outline' : 'cash-check'}
            size={18}
            color={typeColor}
          />
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
            {isCharge ? 'Charge' : 'Payment'}
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
            selectionColor={CARD_COLOR}
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
          selectionColor={CARD_COLOR}
          placeholderTextColor={Colors.outline}
          placeholder="Add a note..."
        />

        {/* Card info */}
        {card && (
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="credit-card-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.infoText}>
              {card.name} · ${card.outstandingBalance.toFixed(2)} outstanding
            </Text>
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
