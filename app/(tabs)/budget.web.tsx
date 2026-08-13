// Web override of the Budget tab. Same data/hooks as budget.tsx (mobile);
// overview stat cards + a WebPanel list instead of a single scrolling stack.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AddBudgetSheet from '@/components/AddBudgetSheet';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors, getCategoryById } from '@/constants/theme';
import { useBudgetsContext } from '@/store/BudgetsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { Budget } from '@/store/useBudgets';

const WARN_COLOR = '#FFB74D';

export default function BudgetScreenWeb() {
  const sheetRef = useRef<BottomSheet>(null);
  const { budgets } = useBudgetsContext();
  const { expenses } = useExpenseContext();
  const [editing, setEditing] = useState<Budget | null>(null);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey)) map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return map;
  }, [expenses, monthKey]);

  const totalBudget = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((s, b) => s + (spentByCategory[b.category] ?? 0), 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const overBudgetCount = budgets.filter((b) => (spentByCategory[b.category] ?? 0) > b.monthlyLimit).length;

  const openAdd = () => { setEditing(null); sheetRef.current?.expand(); };
  const openEdit = (b: Budget) => { setEditing(b); sheetRef.current?.expand(); };

  const sorted = useMemo(
    () => [...budgets].sort((a, b) => {
      const pa = (spentByCategory[a.category] ?? 0) / a.monthlyLimit;
      const pb = (spentByCategory[b.category] ?? 0) / b.monthlyLimit;
      return pb - pa;
    }),
    [budgets, spentByCategory]
  );

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.sub}>{monthName} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} left</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>Add Budget</Text>
        </Pressable>
      </View>

      {budgets.length === 0 ? (
        <WebPanel title="Budgets">
          <Text style={styles.emptyText}>Set a monthly limit per category and watch your spending stay on track.</Text>
        </WebPanel>
      ) : (
        <>
          <View style={styles.statRow}>
            <WebStatCard label="Spent" value={`$${totalSpent.toFixed(2)}`} valueColor={totalPct >= 100 ? Colors.danger : totalPct >= 80 ? WARN_COLOR : Colors.primary} note={`of $${totalBudget.toFixed(2)} budgeted`} />
            <WebStatCard label="% Used" value={`${totalPct.toFixed(0)}%`} />
            <WebStatCard label="Over Budget" value={`${overBudgetCount}`} valueColor={overBudgetCount > 0 ? Colors.danger : Colors.primary} note="categories" />
          </View>

          <WebPanel title="Categories">
            {sorted.map((budget) => {
              const spent = spentByCategory[budget.category] ?? 0;
              const pct = (spent / budget.monthlyLimit) * 100;
              const remaining = budget.monthlyLimit - spent;
              const cat = getCategoryById(budget.category);
              const barColor = pct >= 100 ? Colors.danger : pct >= 80 ? WARN_COLOR : cat.color;
              return (
                <Pressable key={budget.id} style={styles.row} onPress={() => openEdit(budget)}>
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={18} color={cat.color} />
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <Text style={[styles.remaining, { color: remaining >= 0 ? Colors.primary : Colors.danger }]}>
                        {remaining >= 0 ? `$${remaining.toFixed(2)} left` : `$${Math.abs(remaining).toFixed(2)} over`}
                      </Text>
                    </View>
                    <Text style={styles.spentText}>${spent.toFixed(2)} of ${budget.monthlyLimit.toFixed(2)}</Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: barColor }]} />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </WebPanel>
        </>
      )}

      <AddBudgetSheet sheetRef={sheetRef} editing={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 13.5 },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  emptyText: { color: Colors.outline, fontSize: 13 },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  catLabel: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  remaining: { fontSize: 12.5, fontWeight: '700' },
  spentText: { color: Colors.textSecondary, fontSize: 12, marginBottom: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.background, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
