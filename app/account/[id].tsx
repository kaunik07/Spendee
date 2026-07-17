import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import AddAccountTransactionSheet from '@/components/AddAccountTransactionSheet';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useAccountTransactions, AccountTransaction } from '@/store/useAccountTransactions';
import { Colors } from '@/constants/theme';

const BANK_BLUE     = '#82B1FF';
const DEPOSIT_COLOR = '#82B1FF';
const WITHDRAW_COLOR = '#F2B8B5';

function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function AccountDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  const { user, storageMode } = useAuthContext();
  const { accounts, updateAccount, deleteAccount } = useAccountsContext();
  const { transactions, addTransaction, deleteTransaction, clearAllForAccount, refresh } =
    useAccountTransactions(id, user?.id ?? null, storageMode);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const account = accounts.find((a) => a.id === id);

  // ── Inline rename ──
  const [isEditing, setIsEditing] = useState(false);
  const [editName,  setEditName]  = useState('');

  const startRename = () => {
    setEditName(account?.name ?? '');
    setIsEditing(true);
  };

  const confirmRename = async () => {
    if (editName.trim().length > 0 && account) {
      await updateAccount(account.id, editName.trim(), account.balance);
    }
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const cancelRename = () => {
    setIsEditing(false);
    Keyboard.dismiss();
  };

  // ── Delete account ──
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      `Delete "${account?.name}" and all its transactions? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearAllForAccount();   // local only; online uses cascade
            await deleteAccount(id);
            router.back();
          },
        },
      ]
    );
  };

  // ── Add transaction ──
  const handleSave = async (
    type: 'deposit' | 'withdrawal',
    amount: number,
    note: string,
  ) => {
    if (!account) return;
    await addTransaction(type, amount, note, todayStr());
    const delta = type === 'deposit' ? amount : -amount;
    await updateAccount(account.id, account.name, account.balance + delta);
  };

  // ── Delete transaction ──
  const handleDeleteTxn = (txn: AccountTransaction) => {
    Alert.alert(
      'Delete Transaction',
      `Remove this ${txn.type === 'deposit' ? 'deposit' : 'withdrawal'} of $${txn.amount.toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!account) return;
            await deleteTransaction(txn.id);
            const delta = txn.type === 'deposit' ? -txn.amount : txn.amount;
            await updateAccount(account.id, account.name, account.balance + delta);
          },
        },
      ]
    );
  };

  // Group transactions by date
  const grouped = useMemo(() => {
    const map: Record<string, AccountTransaction[]> = {};
    transactions.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  if (!account) return null;

  type ListItem =
    | { kind: 'header'; date: string }
    | { kind: 'txn'; txn: AccountTransaction };

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
            selectionColor={BANK_BLUE}
          />
        ) : (
          <Text style={styles.headerTitle} numberOfLines={1}>{account.name}</Text>
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
            <TouchableOpacity onPress={handleDeleteAccount} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceIconWrap}>
          <MaterialCommunityIcons name="bank-outline" size={22} color={BANK_BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount}>${account.balance.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => sheetRef.current?.expand()}
          activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus" size={20} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>Transaction</Text>
        </TouchableOpacity>
      </View>

      {/* Transaction list */}
      {listData.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="swap-vertical-circle-outline" size={52} color={Colors.outline} />
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptySubtitle}>Tap &quot;Transaction&quot; to record a deposit or withdrawal</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) =>
            item.kind === 'header' ? `hdr-${item.date}` : `txn-${item.txn.id}`
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.dateHeader}>{formatDate(item.date)}</Text>;
            }
            const { txn } = item;
            const isDeposit = txn.type === 'deposit';
            const color     = isDeposit ? DEPOSIT_COLOR : WITHDRAW_COLOR;
            return (
              <TouchableOpacity
                style={styles.txnRow}
                onPress={() => router.push(`/edit-account-txn/${txn.id}?accountId=${id}`)}
                activeOpacity={0.75}>
                <View style={[styles.txnIcon, { backgroundColor: color + '18' }]}>
                  <MaterialCommunityIcons
                    name={isDeposit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    size={22}
                    color={color}
                  />
                </View>
                <View style={styles.txnBody}>
                  <Text style={styles.txnType}>
                    {isDeposit ? 'Deposit' : 'Withdrawal'}
                  </Text>
                  {txn.note ? (
                    <Text style={styles.txnNote} numberOfLines={1}>{txn.note}</Text>
                  ) : null}
                </View>
                <Text style={[styles.txnAmount, { color }]}>
                  {isDeposit ? '+' : '−'}${txn.amount.toFixed(2)}
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

      <AddAccountTransactionSheet sheetRef={sheetRef} onSave={handleSave} />
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
    borderBottomColor: BANK_BLUE,
    paddingVertical: 2,
  },
  headerActions: { flexDirection: 'row', gap: 2 },
  headerBtn:    { padding: 6 },

  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 18,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: BANK_BLUE + '40',
  },
  balanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: BANK_BLUE + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  balanceAmount: { color: BANK_BLUE, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },

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
  txnAmount:    { fontSize: 15, fontWeight: '700' },
  txnDeleteBtn: { padding: 4 },
});
