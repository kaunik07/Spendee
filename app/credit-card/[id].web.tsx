// Web override of Credit Card detail. Same data/hooks/logic as [id].tsx (mobile).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AddCreditCardTransactionSheet from '@/components/AddCreditCardTransactionSheet';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { notifySync } from '@/store/syncBus';
import { enqueue, flushAndNotify, opId, SyncOp } from '@/store/syncQueue';
import { addAccountTransactionDirect, deleteAccountTransactionDirect } from '@/store/useAccountTransactions';
import { CreditCardTransaction, useCreditCardTransactions } from '@/store/useCreditCardTransactions';

const CARD_COLOR = '#E8906A';
const CHARGE_COLOR = '#F2B8B5';
const PAYMENT_COLOR = '#A8EDBB';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function CreditCardDetailScreenWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  const { user, storageMode } = useAuthContext();
  const { cards, updateCard, setBillingDay, deleteCard, ccTxnVersion } = useCreditCardsContext();
  const { accounts, updateAccount } = useAccountsContext();
  const { transactions, addTransaction, deleteTransaction, clearAllForCard, refresh } =
    useCreditCardTransactions(id, user?.id ?? null, storageMode, ccTxnVersion);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const card = cards.find((c) => c.id === id);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingInput, setBillingInput] = useState('');

  const startRename = () => { setEditName(card?.name ?? ''); setIsEditing(true); };
  const confirmRename = async () => {
    if (editName.trim().length > 0 && card) await updateCard(card.id, editName.trim(), card.outstandingBalance, card.creditLimit);
    setIsEditing(false);
  };
  const saveBillingDay = async () => {
    const n = parseInt(billingInput, 10);
    await setBillingDay(id, n >= 1 && n <= 31 ? n : null);
    setEditingBilling(false);
  };

  const handleDeleteCard = () => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${card?.name}" and all its transactions? This cannot be undone.`)) return;
    (async () => { await clearAllForCard(); await deleteCard(id); router.back(); })();
  };

  const handleSave = async (type: 'charge' | 'payment', amount: number, note: string, bankAccountId: string | null) => {
    if (!card || !user?.id) return;
    const cardDelta = type === 'charge' ? amount : -amount;
    if (storageMode === 'online') {
      const bundle: SyncOp[] = [];
      let linkedBankTransactionId: string | null = null;
      if (type === 'payment' && bankAccountId) {
        linkedBankTransactionId = Crypto.randomUUID();
        bundle.push({ id: opId(), kind: 'insert', table: 'account_transactions', row: { id: linkedBankTransactionId, account_id: bankAccountId, user_id: user.id, type: 'withdrawal', amount, note: `Credit Card Payment - ${card.name}`, date: todayStr(), created_at: Date.now() } });
        bundle.push({ id: opId(), kind: 'balanceAccount', accountId: bankAccountId, delta: -amount });
      }
      const ccTxnId = Crypto.randomUUID();
      bundle.push({ id: opId(), kind: 'insert', table: 'credit_card_transactions', row: { id: ccTxnId, card_id: card.id, user_id: user.id, type, amount, note: note.trim(), date: todayStr(), bank_account_id: bankAccountId, linked_bank_transaction_id: linkedBankTransactionId, created_at: Date.now() } });
      bundle.push({ id: opId(), kind: 'balanceCard', cardId: card.id, delta: cardDelta });
      await enqueue(user.id, ...bundle);
      notifySync();
      flushAndNotify(user.id);
    } else {
      let linkedBankTransactionId: string | null = null;
      if (type === 'payment' && bankAccountId) {
        const bankAccount = accounts.find((a) => a.id === bankAccountId);
        if (bankAccount) {
          linkedBankTransactionId = await addAccountTransactionDirect(user.id, storageMode, { accountId: bankAccountId, type: 'withdrawal', amount, note: `Credit Card Payment - ${card.name}`, date: todayStr() });
          await updateAccount(bankAccountId, bankAccount.name, bankAccount.balance - amount);
        }
      }
      await addTransaction(type, amount, note, todayStr(), bankAccountId, linkedBankTransactionId);
      await updateCard(card.id, card.name, card.outstandingBalance + cardDelta, card.creditLimit);
    }
  };

  const handleDeleteTxn = (txn: CreditCardTransaction) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove this ${txn.type} of $${txn.amount.toFixed(2)}?`)) return;
    (async () => {
      if (!card || !user?.id) return;
      const cardDelta = txn.type === 'charge' ? -txn.amount : txn.amount;
      if (storageMode === 'online') {
        const bundle: SyncOp[] = [
          { id: opId(), kind: 'delete', table: 'credit_card_transactions', rowId: txn.id },
          { id: opId(), kind: 'balanceCard', cardId: card.id, delta: cardDelta },
        ];
        if (txn.type === 'payment' && txn.bankAccountId) {
          bundle.push({ id: opId(), kind: 'balanceAccount', accountId: txn.bankAccountId, delta: txn.amount });
          if (txn.linkedBankTransactionId) bundle.push({ id: opId(), kind: 'delete', table: 'account_transactions', rowId: txn.linkedBankTransactionId });
        }
        await enqueue(user.id, ...bundle);
        notifySync();
        flushAndNotify(user.id);
      } else {
        await deleteTransaction(txn.id);
        await updateCard(card.id, card.name, card.outstandingBalance + cardDelta, card.creditLimit);
        if (txn.type === 'payment' && txn.bankAccountId) {
          const bankAccount = accounts.find((a) => a.id === txn.bankAccountId);
          if (bankAccount) await updateAccount(txn.bankAccountId, bankAccount.name, bankAccount.balance + txn.amount);
          if (txn.linkedBankTransactionId) await deleteAccountTransactionDirect(user.id, storageMode, txn.linkedBankTransactionId);
        }
      }
    })();
  };

  const utilization = card?.creditLimit && card.creditLimit > 0 && card.outstandingBalance > 0
    ? Math.min(100, (card.outstandingBalance / card.creditLimit) * 100) : null;

  const grouped = useMemo(() => {
    const map: Record<string, CreditCardTransaction[]> = {};
    transactions.forEach((t) => { (map[t.date] ??= []).push(t); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  if (!card) return null;

  return (
    <View>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.outline} />
        </Pressable>
        {isEditing ? (
          <TextInput style={styles.headerInput} value={editName} onChangeText={setEditName} autoFocus onSubmitEditing={confirmRename} selectionColor={CARD_COLOR} />
        ) : (
          <Text style={styles.title}>{card.name}</Text>
        )}
        <View style={{ flex: 1 }} />
        {isEditing ? (
          <>
            <Pressable onPress={confirmRename} hitSlop={10} style={styles.iconBtn}><MaterialCommunityIcons name="check" size={19} color={Colors.primary} /></Pressable>
            <Pressable onPress={() => setIsEditing(false)} hitSlop={10} style={styles.iconBtn}><MaterialCommunityIcons name="close" size={19} color={Colors.outline} /></Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={startRename} hitSlop={10} style={styles.iconBtn}><MaterialCommunityIcons name="pencil-outline" size={17} color={Colors.outline} /></Pressable>
            <Pressable onPress={handleDeleteCard} hitSlop={10} style={styles.iconBtn}><MaterialCommunityIcons name="trash-can-outline" size={17} color={Colors.danger} /></Pressable>
          </>
        )}
      </View>

      <View style={styles.statRow}>
        <WebStatCard
          label="Outstanding Balance"
          value={`${card.outstandingBalance < 0 ? '−' : ''}$${Math.abs(card.outstandingBalance).toFixed(2)}`}
          valueColor={CARD_COLOR}
          note={card.creditLimit != null ? `of $${card.creditLimit.toFixed(2)} limit${utilization !== null ? ` · ${utilization.toFixed(0)}% used` : ''}` : undefined}
        />
      </View>

      <View style={styles.billingRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={Colors.textSecondary} />
        {editingBilling ? (
          <>
            <TextInput
              style={styles.billingInput}
              value={billingInput}
              onChangeText={(t) => { if (/^\d{0,2}$/.test(t)) setBillingInput(t); }}
              keyboardType="number-pad"
              placeholder="1–31"
              placeholderTextColor={Colors.outline}
              autoFocus
              maxLength={2}
              onSubmitEditing={saveBillingDay}
              selectionColor={CARD_COLOR}
            />
            <Pressable onPress={saveBillingDay} hitSlop={8}><MaterialCommunityIcons name="check" size={16} color={Colors.primary} /></Pressable>
            <Pressable onPress={() => setEditingBilling(false)} hitSlop={8}><MaterialCommunityIcons name="close" size={16} color={Colors.outline} /></Pressable>
          </>
        ) : (
          <Pressable style={styles.billingTap} onPress={() => { setBillingInput(card.billingDay ? String(card.billingDay) : ''); setEditingBilling(true); }}>
            <Text style={styles.billingText}>{card.billingDay ? `Payment due the ${ordinal(card.billingDay)}` : 'Set payment due day'}</Text>
            <MaterialCommunityIcons name="pencil-outline" size={12} color={Colors.outline} />
          </Pressable>
        )}
      </View>

      <WebPanel
        title="Transactions"
        linkLabel="+ Transaction"
        onLinkPress={() => sheetRef.current?.expand()}
        style={{ marginTop: 20 }}>
        {grouped.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet — add a charge or payment above.</Text>
        ) : (
          grouped.map(([date, txns]) => (
            <View key={date}>
              <Text style={styles.dateHeader}>{formatDate(date)}</Text>
              {txns.map((txn) => {
                const isCharge = txn.type === 'charge';
                const color = isCharge ? CHARGE_COLOR : PAYMENT_COLOR;
                return (
                  <Pressable key={txn.id} style={styles.row} onPress={() => router.push(`/edit-cc-txn/${txn.id}?cardId=${id}`)}>
                    <View style={[styles.rowIcon, { backgroundColor: color + '18' }]}>
                      <MaterialCommunityIcons name={isCharge ? 'credit-card-outline' : 'cash-check'} size={17} color={color} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{isCharge ? 'Charge' : 'Payment'}</Text>
                      {txn.note ? <Text style={styles.rowSub} numberOfLines={1}>{txn.note}</Text> : null}
                      {!isCharge && txn.bankAccountId ? <Text style={styles.rowBank} numberOfLines={1}>from {accounts.find((a) => a.id === txn.bankAccountId)?.name ?? 'Bank Account'}</Text> : null}
                    </View>
                    <Text style={[styles.rowAmt, { color }]}>{isCharge ? '+' : '−'}${txn.amount.toFixed(2)}</Text>
                    <Pressable onPress={(e) => { e.stopPropagation?.(); handleDeleteTxn(txn); }} hitSlop={8} style={{ marginLeft: 10 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color={Colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </WebPanel>

      <AddCreditCardTransactionSheet sheetRef={sheetRef} accounts={accounts} onSave={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  headerInput: { color: Colors.text, fontSize: 20, fontWeight: '800', borderBottomWidth: 1.5, borderBottomColor: CARD_COLOR, paddingVertical: 2, minWidth: 200 },
  iconBtn: { padding: 6, marginLeft: 4 },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },

  billingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  billingTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  billingText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  billingInput: { color: Colors.text, fontSize: 13, fontWeight: '600', borderBottomWidth: 1.5, borderBottomColor: CARD_COLOR, minWidth: 40, paddingVertical: 2, textAlign: 'center' },

  emptyText: { color: Colors.outline, fontSize: 13 },
  dateHeader: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowTitle: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: Colors.textSecondary, fontSize: 11.5, marginTop: 1 },
  rowBank: { color: '#82B1FF', fontSize: 10.5, marginTop: 1 },
  rowAmt: { fontSize: 13.5, fontWeight: '700' },
});
