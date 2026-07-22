import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import AddCreditCardTransactionSheet from '@/components/AddCreditCardTransactionSheet';
import { useAccountsContext } from '@/store/AccountsContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardTransactions, CreditCardTransaction } from '@/store/useCreditCardTransactions';
import { addAccountTransactionDirect, deleteAccountTransactionDirect } from '@/store/useAccountTransactions';
import { SyncOp, enqueue, opId, flushAndNotify } from '@/store/syncQueue';
import { notifySync } from '@/store/syncBus';
import { Colors } from '@/constants/theme';

const CARD_COLOR    = '#E8906A';   // coral — credit card accent
const CHARGE_COLOR  = '#F2B8B5';  // red — a charge increases what you owe
const PAYMENT_COLOR = '#A8EDBB';  // green — a payment reduces what you owe

function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function CreditCardDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  const { user, storageMode }                    = useAuthContext();
  const { cards, updateCard, deleteCard, ccTxnVersion } = useCreditCardsContext();
  const { accounts, updateAccount }              = useAccountsContext();
  const { transactions, addTransaction, deleteTransaction, clearAllForCard, refresh } =
    useCreditCardTransactions(id, user?.id ?? null, storageMode, ccTxnVersion);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const card = cards.find((c) => c.id === id);

  // ── Inline rename ──
  const [isEditing, setIsEditing] = useState(false);
  const [editName,  setEditName]  = useState('');

  const startRename = () => {
    setEditName(card?.name ?? '');
    setIsEditing(true);
  };

  const confirmRename = async () => {
    if (editName.trim().length > 0 && card) {
      await updateCard(card.id, editName.trim(), card.outstandingBalance, card.creditLimit);
    }
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const cancelRename = () => {
    setIsEditing(false);
    Keyboard.dismiss();
  };

  // ── Delete card ──
  const handleDeleteCard = () => {
    Alert.alert(
      'Delete Card',
      `Delete "${card?.name}" and all its transactions? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearAllForCard();
            await deleteCard(id);
            router.back();
          },
        },
      ]
    );
  };

  // ── Add transaction ──
  // Online: queue the card transaction + card balance delta (and, for a payment
  // from a bank account, the bank withdrawal + bank balance delta) as one bundle.
  const handleSave = async (
    type: 'charge' | 'payment',
    amount: number,
    note: string,
    bankAccountId: string | null,
  ) => {
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
          linkedBankTransactionId = await addAccountTransactionDirect(user.id, storageMode, {
            accountId: bankAccountId, type: 'withdrawal', amount, note: `Credit Card Payment - ${card.name}`, date: todayStr(),
          });
          await updateAccount(bankAccountId, bankAccount.name, bankAccount.balance - amount);
        }
      }
      await addTransaction(type, amount, note, todayStr(), bankAccountId, linkedBankTransactionId);
      await updateCard(card.id, card.name, card.outstandingBalance + cardDelta, card.creditLimit);
    }
  };

  // ── Delete transaction ──
  const handleDeleteTxn = (txn: CreditCardTransaction) => {
    Alert.alert(
      'Delete Transaction',
      `Remove this ${txn.type === 'charge' ? 'charge' : 'payment'} of $${txn.amount.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!card || !user?.id) return;
            const cardDelta = txn.type === 'charge' ? -txn.amount : txn.amount; // reverse

            if (storageMode === 'online') {
              const bundle: SyncOp[] = [
                { id: opId(), kind: 'delete', table: 'credit_card_transactions', rowId: txn.id },
                { id: opId(), kind: 'balanceCard', cardId: card.id, delta: cardDelta },
              ];
              if (txn.type === 'payment' && txn.bankAccountId) {
                bundle.push({ id: opId(), kind: 'balanceAccount', accountId: txn.bankAccountId, delta: txn.amount }); // refund
                if (txn.linkedBankTransactionId) {
                  bundle.push({ id: opId(), kind: 'delete', table: 'account_transactions', rowId: txn.linkedBankTransactionId });
                }
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
          },
        },
      ]
    );
  };

  // ── Utilization ──
  const utilization = card?.creditLimit && card.creditLimit > 0 && card.outstandingBalance > 0
    ? Math.min(100, (card.outstandingBalance / card.creditLimit) * 100)
    : null;

  // ── Group transactions by date ──
  const grouped = useMemo(() => {
    const map: Record<string, CreditCardTransaction[]> = {};
    transactions.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  if (!card) return null;

  type ListItem =
    | { kind: 'header'; date: string }
    | { kind: 'txn'; txn: CreditCardTransaction };

  const listData: ListItem[] = [];
  grouped.forEach(([date, txns]) => {
    listData.push({ kind: 'header', date });
    txns.forEach((t) => listData.push({ kind: 'txn', txn: t }));
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>

        {isEditing ? (
          <TextInput
            style={styles.headerInput}
            value={editName}
            onChangeText={setEditName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={confirmRename}
            selectionColor={CARD_COLOR}
          />
        ) : (
          <Text style={styles.headerTitle} numberOfLines={1}>{card.name}</Text>
        )}

        {isEditing ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={confirmRename} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="check" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelRename} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.outline} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={startRename} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteCard} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <View style={styles.balanceIconWrap}>
            <MaterialCommunityIcons name="credit-card-outline" size={22} color={CARD_COLOR} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.balanceLabel}>Outstanding Balance</Text>
            <Text style={styles.balanceAmount}>
              {card.outstandingBalance < 0 ? '−' : ''}${Math.abs(card.outstandingBalance).toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => sheetRef.current?.expand()}
            activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus" size={20} color={Colors.onPrimary} />
            <Text style={styles.addBtnText}>Transaction</Text>
          </TouchableOpacity>
        </View>

        {/* Credit limit / utilization */}
        {card.creditLimit != null && (
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>
              Credit limit: ${card.creditLimit.toFixed(2)}
            </Text>
            {utilization !== null && (
              <View style={styles.utilizationWrap}>
                <View style={styles.utilizationTrack}>
                  <View
                    style={[
                      styles.utilizationFill,
                      {
                        width: `${utilization}%` as any,
                        backgroundColor: utilization > 80 ? Colors.danger : CARD_COLOR,
                      },
                    ]}
                  />
                </View>
                <Text style={[
                  styles.utilizationPct,
                  { color: utilization > 80 ? Colors.danger : CARD_COLOR },
                ]}>
                  {utilization.toFixed(0)}% used
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Transaction list */}
      {listData.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="credit-card-clock-outline" size={52} color={Colors.outline} />
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap &quot;Transaction&quot; to record a charge or payment
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) =>
            item.kind === 'header' ? `hdr-${item.date}` : `txn-${item.txn.id}`
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.dateHeader}>{formatDate(item.date)}</Text>;
            }
            const { txn } = item;
            const isCharge = txn.type === 'charge';
            const color    = isCharge ? CHARGE_COLOR : PAYMENT_COLOR;
            return (
              <TouchableOpacity
                style={styles.txnRow}
                onPress={() => router.push(`/edit-cc-txn/${txn.id}?cardId=${id}`)}
                activeOpacity={0.75}>
                <View style={[styles.txnIcon, { backgroundColor: color + '18' }]}>
                  <MaterialCommunityIcons
                    name={isCharge ? 'credit-card-outline' : 'cash-check'}
                    size={22}
                    color={color}
                  />
                </View>
                <View style={styles.txnBody}>
                  <Text style={styles.txnType}>
                    {isCharge ? 'Charge' : 'Payment'}
                  </Text>
                  {txn.note ? (
                    <Text style={styles.txnNote} numberOfLines={1}>{txn.note}</Text>
                  ) : null}
                  {!isCharge && txn.bankAccountId ? (
                    <Text style={styles.txnBank} numberOfLines={1}>
                      from {accounts.find((a) => a.id === txn.bankAccountId)?.name ?? 'Bank Account'}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.txnAmount, { color }]}>
                  {isCharge ? '+' : '−'}${txn.amount.toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDeleteTxn(txn)}
                  hitSlop={10}
                  style={styles.txnDeleteBtn}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <AddCreditCardTransactionSheet sheetRef={sheetRef} accounts={accounts} onSave={handleSave} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: CARD_COLOR,
    paddingVertical: 2,
  },
  headerActions: { flexDirection: 'row', gap: 2 },
  headerBtn:    { padding: 6 },

  balanceCard: {
    marginHorizontal: 18,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: CARD_COLOR + '40',
    gap: 14,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  balanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: CARD_COLOR + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  balanceAmount: { color: CARD_COLOR, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: { color: Colors.onPrimary, fontSize: 13, fontWeight: '700' },

  limitRow: { gap: 6 },
  limitLabel: { color: Colors.textSecondary, fontSize: 12 },
  utilizationWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  utilizationTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  utilizationFill: { height: '100%', borderRadius: 3 },
  utilizationPct:  { fontSize: 11, fontWeight: '700', minWidth: 52 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle:    { color: Colors.textSecondary, fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

  listContent: { paddingHorizontal: 18, paddingBottom: 40 },

  dateHeader: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },

  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  txnIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnBody:      { flex: 1, gap: 2 },
  txnType:      { color: Colors.text, fontSize: 14, fontWeight: '600' },
  txnNote:      { color: Colors.textSecondary, fontSize: 12 },
  txnBank:      { color: '#82B1FF', fontSize: 11 },
  txnAmount:    { fontSize: 15, fontWeight: '700' },
  txnDeleteBtn: { padding: 4 },
});
