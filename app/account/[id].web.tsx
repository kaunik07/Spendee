// Web override of Account detail. Same data/hooks/logic as [id].tsx (mobile).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AddAccountTransactionSheet from '@/components/AddAccountTransactionSheet';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { notifySync } from '@/store/syncBus';
import { enqueue, flushAndNotify, opId } from '@/store/syncQueue';
import { AccountTransaction, useAccountTransactions } from '@/store/useAccountTransactions';

const BANK_BLUE = '#82B1FF';
const DEPOSIT_COLOR = '#82B1FF';
const WITHDRAW_COLOR = '#F2B8B5';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function AccountDetailScreenWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  const { user, storageMode } = useAuthContext();
  const { accounts, updateAccount, deleteAccount } = useAccountsContext();
  const { transactions, addTransaction, deleteTransaction, clearAllForAccount, refresh } =
    useAccountTransactions(id, user?.id ?? null, storageMode);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const account = accounts.find((a) => a.id === id);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const startRename = () => { setEditName(account?.name ?? ''); setIsEditing(true); };
  const confirmRename = async () => {
    if (editName.trim().length > 0 && account) await updateAccount(account.id, editName.trim(), account.balance);
    setIsEditing(false);
  };

  const handleDeleteAccount = () => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${account?.name}" and all its transactions? This cannot be undone.`)) return;
    (async () => { await clearAllForAccount(); await deleteAccount(id); router.back(); })();
  };

  const handleSave = async (type: 'deposit' | 'withdrawal', amount: number, note: string) => {
    if (!account || !user?.id) return;
    const delta = type === 'deposit' ? amount : -amount;
    if (storageMode === 'online') {
      const txnId = Crypto.randomUUID();
      await enqueue(user.id,
        { id: opId(), kind: 'insert', table: 'account_transactions', row: { id: txnId, account_id: account.id, user_id: user.id, type, amount, note: note.trim(), date: todayStr(), created_at: Date.now() } },
        { id: opId(), kind: 'balanceAccount', accountId: account.id, delta },
      );
      notifySync();
      flushAndNotify(user.id);
    } else {
      await addTransaction(type, amount, note, todayStr());
      await updateAccount(account.id, account.name, account.balance + delta);
    }
  };

  const handleDeleteTxn = (txn: AccountTransaction) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove this ${txn.type} of $${txn.amount.toFixed(2)}?`)) return;
    (async () => {
      if (!account || !user?.id) return;
      const delta = txn.type === 'deposit' ? -txn.amount : txn.amount;
      if (storageMode === 'online') {
        await enqueue(user.id,
          { id: opId(), kind: 'delete', table: 'account_transactions', rowId: txn.id },
          { id: opId(), kind: 'balanceAccount', accountId: account.id, delta },
        );
        notifySync();
        flushAndNotify(user.id);
      } else {
        await deleteTransaction(txn.id);
        await updateAccount(account.id, account.name, account.balance + delta);
      }
    })();
  };

  const grouped = useMemo(() => {
    const map: Record<string, AccountTransaction[]> = {};
    transactions.forEach((t) => { (map[t.date] ??= []).push(t); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  if (!account) return null;

  return (
    <View>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.outline} />
        </Pressable>
        {isEditing ? (
          <TextInput style={styles.headerInput} value={editName} onChangeText={setEditName} autoFocus onSubmitEditing={confirmRename} selectionColor={BANK_BLUE} />
        ) : (
          <Text style={styles.title}>{account.name}</Text>
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
            <Pressable onPress={handleDeleteAccount} hitSlop={10} style={styles.iconBtn}><MaterialCommunityIcons name="trash-can-outline" size={17} color={Colors.danger} /></Pressable>
          </>
        )}
      </View>

      <View style={styles.statRow}>
        <WebStatCard label="Current Balance" value={`$${account.balance.toFixed(2)}`} valueColor={BANK_BLUE} />
      </View>

      <WebPanel
        title="Transactions"
        linkLabel="+ Transaction"
        onLinkPress={() => sheetRef.current?.expand()}>
        {grouped.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet — add a deposit or withdrawal above.</Text>
        ) : (
          grouped.map(([date, txns]) => (
            <View key={date}>
              <Text style={styles.dateHeader}>{formatDate(date)}</Text>
              {txns.map((txn) => {
                const isDeposit = txn.type === 'deposit';
                const color = isDeposit ? DEPOSIT_COLOR : WITHDRAW_COLOR;
                return (
                  <Pressable key={txn.id} style={styles.row} onPress={() => router.push(`/edit-account-txn/${txn.id}?accountId=${id}`)}>
                    <View style={[styles.rowIcon, { backgroundColor: color + '18' }]}>
                      <MaterialCommunityIcons name={isDeposit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'} size={18} color={color} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{isDeposit ? 'Deposit' : 'Withdrawal'}</Text>
                      {txn.note ? <Text style={styles.rowSub} numberOfLines={1}>{txn.note}</Text> : null}
                    </View>
                    <Text style={[styles.rowAmt, { color }]}>{isDeposit ? '+' : '−'}${txn.amount.toFixed(2)}</Text>
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

      <AddAccountTransactionSheet sheetRef={sheetRef} onSave={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  headerInput: { color: Colors.text, fontSize: 20, fontWeight: '800', borderBottomWidth: 1.5, borderBottomColor: BANK_BLUE, paddingVertical: 2, minWidth: 200 },
  iconBtn: { padding: 6, marginLeft: 4 },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  emptyText: { color: Colors.outline, fontSize: 13 },

  dateHeader: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowTitle: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: Colors.textSecondary, fontSize: 11.5, marginTop: 1 },
  rowAmt: { fontSize: 13.5, fontWeight: '700' },
});
