// Web override of the Expenses list. Same data/hooks as expenses.tsx
// (mobile); date-grouped panel (Today highlighted first) instead of a flat
// card list, "+ Add Expense" triggers the same AddExpenseSheet component
// (its chrome branches to WebDrawer on web internally — see
// components/AddExpenseSheet.tsx).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AddExpenseSheet from '@/components/AddExpenseSheet';
import WebDrawer from '@/components/web/WebDrawer';
import WebPanel from '@/components/web/WebPanel';
import { getSubcategoryById } from '@/constants/subcategories';
import { Categories, Colors, getCategoryById } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useExpenseActions } from '@/store/useExpenseActions';
import { Expense } from '@/store/useExpenses';

const PENDING_AMBER = '#FFB74D';

function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ExpensesScreenWeb() {
  const sheetRef = useRef<BottomSheet>(null);
  const router = useRouter();
  const { expenses, pendingCount, syncing } = useExpenseContext();
  const { deleteExpenseWithReversal } = useExpenseActions();
  const today = todayStr();

  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const activeCats = filterCategories.map(getCategoryById);

  const toggleCategory = (id: string) => {
    setFilterCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthTotal = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);

  const filteredExpenses = useMemo(
    () => filterCategories.length > 0 ? expenses.filter((e) => filterCategories.includes(e.category)) : expenses,
    [expenses, filterCategories]
  );

  const grouped = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    filteredExpenses.forEach((e) => { (map[e.date] ??= []).push(e); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredExpenses]);

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Expenses</Text>
          <Text style={styles.sub}>{monthName} · ${monthTotal.toFixed(2)} total</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => sheetRef.current?.expand()}>
          <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </Pressable>
      </View>

      {pendingCount > 0 && (
        <View style={styles.syncBanner}>
          <MaterialCommunityIcons name={syncing ? 'cloud-sync-outline' : 'cloud-off-outline'} size={15} color={PENDING_AMBER} />
          <Text style={styles.syncText}>{pendingCount} expense{pendingCount !== 1 ? 's' : ''} {syncing ? 'syncing…' : 'waiting to sync'}</Text>
        </View>
      )}

      <View style={styles.filterRow}>
        <Pressable style={styles.filterChip} onPress={() => setFilterDrawerOpen(true)}>
          <MaterialCommunityIcons name="filter-variant" size={14} color={filterCategories.length > 0 ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.filterChipText, filterCategories.length > 0 && { color: Colors.primary }]}>
            {filterCategories.length === 0 ? 'Filter by category' : `${filterCategories.length} categor${filterCategories.length === 1 ? 'y' : 'ies'}`}
          </Text>
        </Pressable>
        {activeCats.map((cat) => (
          <View key={cat.id} style={[styles.filterChipActive, { borderColor: cat.color + '80', backgroundColor: cat.color + '15' }]}>
            <MaterialCommunityIcons name={cat.icon as any} size={13} color={cat.color} />
            <Text style={[styles.filterChipActiveText, { color: cat.color }]}>{cat.label}</Text>
            <Pressable onPress={() => toggleCategory(cat.id)} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={14} color={cat.color} />
            </Pressable>
          </View>
        ))}
        {filterCategories.length > 0 && (
          <Pressable onPress={() => setFilterCategories([])} hitSlop={8} style={styles.clearAllBtn}>
            <Text style={styles.clearAllText}>Clear all</Text>
          </Pressable>
        )}
      </View>

      <WebPanel
        title="Transactions"
        linkLabel={filterCategories.length > 0 ? `${filteredExpenses.length} of ${expenses.length}` : `${expenses.length} total`}>
        {expenses.length === 0 ? (
          <Text style={styles.emptyText}>No expenses yet — add your first one above.</Text>
        ) : filteredExpenses.length === 0 ? (
          <Text style={styles.emptyText}>No expenses in the selected categories yet.</Text>
        ) : (
          grouped.map(([date, items]) => {
            const isToday = date === today;
            const groupTotal = items.reduce((s, e) => s + e.amount, 0);
            return (
              <View key={date}>
                <View style={styles.groupHeader}>
                  {isToday && <View style={styles.todayDot} />}
                  <Text style={[styles.groupHeaderText, isToday && styles.groupHeaderTextToday]}>
                    {isToday ? 'Today' : formatGroupDate(date)}
                  </Text>
                  <Text style={[styles.groupHeaderTotal, isToday && styles.groupHeaderTextToday]}>
                    -${groupTotal.toFixed(2)}
                  </Text>
                </View>
                {items.map((item) => (
                  <ExpenseRow
                    key={item.id}
                    item={item}
                    highlight={isToday}
                    onDelete={() => deleteExpenseWithReversal(item)}
                    onOpen={() => router.push(`/edit-expense/${item.id}`)}
                  />
                ))}
              </View>
            );
          })
        )}
      </WebPanel>

      <AddExpenseSheet sheetRef={sheetRef} />
      <WebDrawer visible={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)} title="Filter by category">
        <View style={styles.filterGrid}>
          {Categories.map((cat) => {
            const selected = filterCategories.includes(cat.id);
            return (
              <Pressable
                key={cat.id}
                style={[styles.filterCell, selected && { borderColor: cat.color, backgroundColor: cat.color + '18' }]}
                onPress={() => toggleCategory(cat.id)}>
                <View style={[styles.filterCellIcon, { backgroundColor: cat.color + '22' }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={18} color={cat.color} />
                </View>
                <Text style={[styles.filterCellLabel, selected && { color: cat.color }]} numberOfLines={1}>{cat.label}</Text>
                {selected && <MaterialCommunityIcons name="check-circle" size={16} color={cat.color} />}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.filterDrawerFooter}>
          <Pressable style={styles.filterClearBtn} onPress={() => setFilterCategories([])}>
            <Text style={styles.filterClearBtnText}>Clear all</Text>
          </Pressable>
          <Pressable style={styles.filterDoneBtn} onPress={() => setFilterDrawerOpen(false)}>
            <Text style={styles.filterDoneBtnText}>
              {filterCategories.length === 0 ? 'Show all' : `Show ${filteredExpenses.length}`}
            </Text>
          </Pressable>
        </View>
      </WebDrawer>
    </View>
  );
}

function ExpenseRow({ item, highlight, onDelete, onOpen }: { item: Expense; highlight: boolean; onDelete: () => void; onOpen: () => void }) {
  const cat = getCategoryById(item.category);
  const sub = getSubcategoryById(item.category, item.subcategory);
  const displayLabel = sub ? `${cat.label} · ${sub.label}` : cat.label;

  return (
    <Pressable style={[styles.row, highlight && styles.rowToday]} onPress={onOpen}>
      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <View style={[styles.icon, { backgroundColor: cat.color + '22' }]}>
          <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {item.pending && (
          <View style={styles.pendingChip}>
            <Text style={styles.pendingChipText}>Pending</Text>
          </View>
        )}
      </View>
      <Text style={[styles.rowText, { flex: 1.4, color: cat.color }]} numberOfLines={1}>{displayLabel}</Text>
      <Text style={[styles.rowAmt, { flex: 1 }]}>-${item.amount.toFixed(2)}</Text>
      <Pressable onPress={(e) => { e.stopPropagation?.(); onDelete(); }} hitSlop={8} style={{ width: 32, alignItems: 'flex-end' }}>
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 13.5 },

  syncBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PENDING_AMBER + '18', borderWidth: 1, borderColor: PENDING_AMBER + '40', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 16 },
  syncText: { color: PENDING_AMBER, fontSize: 12.5, fontWeight: '600' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8,
  },
  filterChipText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  filterChipActive: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8,
  },
  filterChipActiveText: { fontSize: 12.5, fontWeight: '700' },
  clearAllBtn: { justifyContent: 'center', paddingHorizontal: 4 },
  clearAllText: { color: Colors.outline, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },

  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filterCell: {
    width: '46%',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  filterCellIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  filterCellLabel: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },

  filterDrawerFooter: { flexDirection: 'row', gap: 10, marginTop: 24 },
  filterClearBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: Colors.border },
  filterClearBtnText: { color: Colors.textSecondary, fontSize: 13.5, fontWeight: '700' },
  filterDoneBtn: { flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.primary },
  filterDoneBtnText: { color: Colors.onPrimary, fontSize: 13.5, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 13 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 6 },
  groupHeaderText: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, flex: 1 },
  groupHeaderTextToday: { color: Colors.primary },
  groupHeaderTotal: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowToday: {
    backgroundColor: Colors.primary + '0D',
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
    borderRadius: 8,
    marginLeft: -10,
    paddingLeft: 8,
  },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: Colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  rowText: { color: Colors.textSecondary, fontSize: 12.5 },
  rowAmt: { color: Colors.text, fontSize: 13.5, fontWeight: '700', textAlign: 'right' },

  pendingChip: { backgroundColor: PENDING_AMBER + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pendingChipText: { color: PENDING_AMBER, fontSize: 9.5, fontWeight: '700' },
});
