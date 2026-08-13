// Edit a credit-card transaction in the right-side drawer, so it matches
// how transactions are added (AddCreditCardTransactionSheet) instead of
// navigating to a separate page. Save logic mirrors the mobile screen at
// app/edit-cc-txn/[id].tsx: write the new amount/note, then apply the
// difference to the card's outstanding balance — a charge increases what
// you owe, a payment decreases it.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import WebDrawer from '@/components/web/WebDrawer';
import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { CreditCardTransaction, updateCCTransactionDirect } from '@/store/useCreditCardTransactions';

const CARD_COLOR    = '#E8906A';
const CHARGE_COLOR  = '#F2B8B5';
const PAYMENT_COLOR = '#A8EDBB';

interface Props {
  txn: CreditCardTransaction | null;
  cardId: string;
  visible: boolean;
  onClose: () => void;
  /** Refetch the card's transactions after a save. */
  onSaved?: () => void;
}

export default function EditCCTxnDrawer({ txn, cardId, visible, onClose, onSaved }: Props) {
  const { user, storageMode } = useAuthContext();
  const { cards, updateCard } = useCreditCardsContext();
  const card = cards.find((c) => c.id === cardId);

  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');

  // Re-seed whenever a different transaction is opened — this component
  // stays mounted between openings, so state would otherwise carry over.
  useEffect(() => {
    if (!txn || !visible) return;
    setAmount(txn.amount.toString());
    setNote(txn.note ?? '');
  }, [txn?.id, visible]);

  const canSave = parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave || !txn || !card || !user?.id) return;

    const newAmount = parseFloat(amount);
    const diff      = newAmount - txn.amount;

    await updateCCTransactionDirect(user.id, storageMode, txn.id, { amount: newAmount, note: note.trim() });

    if (diff !== 0) {
      const outstandingDelta = txn.type === 'charge' ? diff : -diff;
      await updateCard(card.id, card.name, card.outstandingBalance + outstandingDelta, card.creditLimit);
    }

    onSaved?.();
    onClose();
  };

  const isCharge  = txn?.type === 'charge';
  const typeColor = isCharge ? CHARGE_COLOR : PAYMENT_COLOR;

  return (
    <WebDrawer visible={visible && !!txn} onClose={onClose} title="Edit Transaction">
      <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '50' }]}>
        <MaterialCommunityIcons
          name={isCharge ? 'credit-card-outline' : 'cash-check'}
          size={16}
          color={typeColor}
        />
        <Text style={[styles.typeBadgeText, { color: typeColor }]}>
          {isCharge ? 'Charge' : 'Payment'}
        </Text>
      </View>

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

      {card && (
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="credit-card-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.infoText}>{card.name} · ${card.outstandingBalance.toFixed(2)} outstanding</Text>
        </View>
      )}

      <Pressable
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!canSave}>
        <MaterialCommunityIcons name="check" size={19} color={Colors.onPrimary} />
        <Text style={styles.saveBtnText}>Save Changes</Text>
      </Pressable>
    </WebDrawer>
  );
}

const styles = StyleSheet.create({
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7,
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, marginBottom: 20,
  },
  typeBadgeText: { fontSize: 12.5, fontWeight: '700' },

  label: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.05, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  amountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainer, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  currencySymbol: { fontSize: 22, fontWeight: '700' },
  amountInput: { color: Colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, minWidth: 80, textAlign: 'center' },

  input: { backgroundColor: Colors.surfaceContainer, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  infoText: { color: Colors.textMuted, fontSize: 12 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 15, marginTop: 28,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
