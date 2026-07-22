import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddExpenseSheet from '@/components/AddExpenseSheet';
import { getSubcategoryById } from '@/constants/subcategories';
import { Colors, getCategoryById } from '@/constants/theme';
import { useAuthContext } from '@/store/AuthContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useExpenseActions } from '@/store/useExpenseActions';
import { Expense } from '@/store/useExpenses';

const PENDING_AMBER = '#FFB74D';

export default function HomeScreen() {
  const sheetRef = useRef<BottomSheet>(null);
  const router = useRouter();
  const { user } = useAuthContext();
  const { expenses, refresh: refreshExpenses, pendingCount, syncing, flush } = useExpenseContext();
  const { deleteExpenseWithReversal }          = useExpenseActions();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    refreshExpenses();
    flush();
    setTimeout(() => setRefreshing(false), 800);
  };

  const now           = new Date();
  const monthName     = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const monthTotal = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);

  const prevMonthTotal = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === prevMonthDate.getMonth() && d.getFullYear() === prevMonthDate.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);

  const delta = monthTotal - prevMonthTotal;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.appName}>Spendee</Text>
                <Text style={styles.headerSub}>Your spending overview</Text>
              </View>
              <TouchableOpacity style={styles.avatarBadge} onPress={() => router.push('/profile')} activeOpacity={0.8}>
                <Text style={styles.avatarInitials}>
                  {user?.username.slice(0, 2).toUpperCase() ?? '??'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Monthly Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View>
                  <Text style={styles.summaryLabel}>{monthName}</Text>
                  <Text style={styles.summaryAmount}>${monthTotal.toFixed(2)}</Text>
                  <Text style={styles.summaryCaption}>Total spent this month</Text>
                  {prevMonthTotal > 0 && Math.abs(delta) >= 0.005 && (
                    <View style={[
                      styles.deltaChip,
                      { backgroundColor: delta > 0 ? Colors.danger + '22' : Colors.primary + '22' },
                    ]}>
                      <MaterialCommunityIcons
                        name={delta > 0 ? 'arrow-up' : 'arrow-down'}
                        size={10}
                        color={delta > 0 ? Colors.danger : Colors.primary}
                      />
                      <Text style={[styles.deltaText, { color: delta > 0 ? Colors.danger : Colors.primary }]}>
                        ${Math.abs(delta).toFixed(2)} vs last month
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.summaryIcon}>
                  <MaterialCommunityIcons name="trending-up" size={32} color={Colors.primary} />
                </View>
              </View>
            </View>

            {/* Offline sync banner */}
            {pendingCount > 0 && (
              <View style={styles.syncBanner}>
                <MaterialCommunityIcons
                  name={syncing ? 'cloud-sync-outline' : 'cloud-off-outline'}
                  size={16}
                  color={PENDING_AMBER}
                />
                <Text style={styles.syncText}>
                  {pendingCount} expense{pendingCount !== 1 ? 's' : ''} {syncing ? 'syncing…' : 'waiting to sync'}
                </Text>
              </View>
            )}

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Transactions</Text>
              <Text style={styles.sectionCount}>{expenses.length}</Text>
            </View>

            {expenses.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="receipt-text-outline" size={56} color={Colors.outline} />
                <Text style={styles.emptyText}>No expenses yet</Text>
                <Text style={styles.emptySubText}>Tap + to record your first expense</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <ExpenseRow item={item} onDelete={() => deleteExpenseWithReversal(item)} />
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => sheetRef.current?.expand()} activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={Colors.onPrimary} />
      </TouchableOpacity>

      <AddExpenseSheet sheetRef={sheetRef} />
    </SafeAreaView>
  );
}


function ExpenseRow({ item, onDelete }: { item: Expense; onDelete: () => void }) {
  const router = useRouter();
  const cat = getCategoryById(item.category);
  const sub = getSubcategoryById(item.category, item.subcategory);

  const displayIcon  = sub?.icon ?? cat.icon;
  const displayLabel = sub ? `${cat.label} · ${sub.label}` : cat.label;

  const displayDate = new Date(item.date + 'T00:00:00').toLocaleDateString('default', {
    month: 'short', day: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.expenseCard} onPress={() => router.push(`/edit-expense/${item.id}`)} activeOpacity={0.75}>
      <View style={[styles.expenseIconWrap, { backgroundColor: cat.color + '20' }]}>
        <MaterialCommunityIcons name={displayIcon as any} size={22} color={cat.color} />
      </View>

      <View style={styles.expenseBody}>
        <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.expenseMeta}>
          <Text style={[styles.expenseCatChip, { color: cat.color }]}>{displayLabel}</Text>
          {item.note ? <Text style={styles.expenseNote} numberOfLines={1}>· {item.note}</Text> : null}
        </View>
        <View style={styles.expenseMeta}>
          <Text style={styles.expenseDate}>{displayDate}</Text>
          {item.pending && (
            <View style={styles.pendingChip}>
              <MaterialCommunityIcons name="cloud-off-outline" size={10} color={PENDING_AMBER} />
              <Text style={styles.pendingChipText}>Pending sync</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>-${item.amount.toFixed(2)}</Text>
        <Pressable onPress={onDelete} hitSlop={10} style={styles.deleteBtn}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
        </Pressable>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  listContent: { paddingHorizontal: 18, paddingBottom: 100 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
  },
  appName: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  avatarInitials: { color: Colors.primary, fontSize: 14, fontWeight: '800' },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  summaryAmount: { color: Colors.primary, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  summaryCaption: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 6,
  },
  deltaText: { fontSize: 11, fontWeight: '700' },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },


  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PENDING_AMBER + '18',
    borderColor: PENDING_AMBER + '40',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  syncText: { color: PENDING_AMBER, fontSize: 12, fontWeight: '600' },

  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: PENDING_AMBER + '1A',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pendingChipText: { color: PENDING_AMBER, fontSize: 9, fontWeight: '700' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sectionCount: {
    backgroundColor: Colors.surfaceContainer,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySubText: { color: Colors.textSecondary, fontSize: 14 },

  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  expenseIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseBody: { flex: 1, gap: 3 },
  expenseName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  expenseMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expenseCatChip: { fontSize: 12, fontWeight: '600' },
  expenseNote: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  expenseDate: { color: Colors.textMuted, fontSize: 11 },
  expenseRight: { alignItems: 'flex-end', gap: 8 },
  expenseAmount: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
  deleteBtn: { padding: 2 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
