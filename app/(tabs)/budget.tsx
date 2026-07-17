import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddBudgetSheet from '@/components/AddBudgetSheet';
import { Colors, getCategoryById } from '@/constants/theme';
import { useBudgetsContext } from '@/store/BudgetsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { Budget } from '@/store/useBudgets';

const WARN_COLOR = '#FFB74D';   // amber — 80–100% of limit

export default function BudgetScreen() {
  const sheetRef = useRef<BottomSheet>(null);
  const { budgets, refresh: refreshBudgets } = useBudgetsContext();
  const { expenses, refresh: refreshExpenses } = useExpenseContext();

  const [editing, setEditing] = useState<Budget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    refreshBudgets();
    refreshExpenses();
    setTimeout(() => setRefreshing(false), 800);
  };

  // ── Current month context ────────────────────────────────
  const now       = new Date();
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - now.getDate();
  const monthPct    = (now.getDate() / daysInMonth) * 100;

  // ── Spend per category this month (synced with expenses) ─
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey)) map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return map;
  }, [expenses, monthKey]);

  const totalBudget = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent  = budgets.reduce((s, b) => s + (spentByCategory[b.category] ?? 0), 0);
  const totalPct    = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const overBudgetCount = budgets.filter((b) => (spentByCategory[b.category] ?? 0) > b.monthlyLimit).length;

  const openAdd  = () => { setEditing(null); sheetRef.current?.expand(); };
  const openEdit = (b: Budget) => { setEditing(b); sheetRef.current?.expand(); };

  // Sort: over-budget first, then by % used descending
  const sorted = useMemo(
    () => [...budgets].sort((a, b) => {
      const pa = (spentByCategory[a.category] ?? 0) / a.monthlyLimit;
      const pb = (spentByCategory[b.category] ?? 0) / b.monthlyLimit;
      return pb - pa;
    }),
    [budgets, spentByCategory]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Budgets</Text>
            <Text style={styles.subtitle}>
              {monthName} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="target" size={22} color={Colors.primary} />
          </View>
        </View>

        {budgets.length > 0 && (
          <>
            {/* Overview card */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewTop}>
                <View>
                  <Text style={styles.overviewLabel}>Spent of total budget</Text>
                  <Text style={styles.overviewAmount}>
                    ${totalSpent.toFixed(2)}
                    <Text style={styles.overviewLimit}>  of ${totalBudget.toFixed(2)}</Text>
                  </Text>
                </View>
                <Text style={[
                  styles.overviewPct,
                  { color: totalPct >= 100 ? Colors.danger : totalPct >= 80 ? WARN_COLOR : Colors.primary },
                ]}>
                  {totalPct.toFixed(0)}%
                </Text>
              </View>

              {/* Overall progress bar with a month-elapsed marker */}
              <View style={styles.overviewTrack}>
                <View style={[
                  styles.overviewFill,
                  {
                    width: `${Math.min(100, totalPct)}%` as any,
                    backgroundColor: totalPct >= 100 ? Colors.danger : totalPct >= 80 ? WARN_COLOR : Colors.primary,
                  },
                ]} />
                <View style={[styles.monthMarker, { left: `${monthPct}%` as any }]} />
              </View>
              <Text style={styles.markerHint}>
                ▲ where the month is — {overBudgetCount > 0
                  ? `${overBudgetCount} categor${overBudgetCount === 1 ? 'y is' : 'ies are'} over budget`
                  : totalPct <= monthPct
                    ? "you're on pace"
                    : 'spending ahead of pace'}
              </Text>
            </View>

            {/* Budget cards */}
            {sorted.map((budget) => {
              const spent = spentByCategory[budget.category] ?? 0;
              const pct   = (spent / budget.monthlyLimit) * 100;
              const remaining = budget.monthlyLimit - spent;
              const cat  = getCategoryById(budget.category);
              const barColor = pct >= 100 ? Colors.danger : pct >= 80 ? WARN_COLOR : cat.color;
              return (
                <TouchableOpacity
                  key={budget.id}
                  style={[styles.budgetCard, pct >= 100 && styles.budgetCardOver]}
                  onPress={() => openEdit(budget)}
                  activeOpacity={0.75}>
                  <View style={styles.budgetTop}>
                    <View style={[styles.catIcon, { backgroundColor: cat.color + '20' }]}>
                      <MaterialCommunityIcons name={cat.icon as any} size={20} color={cat.color} />
                    </View>
                    <View style={styles.budgetBody}>
                      <Text style={styles.catLabel}>{cat.label}</Text>
                      <Text style={styles.spentText}>
                        ${spent.toFixed(2)} <Text style={styles.limitText}>of ${budget.monthlyLimit.toFixed(2)}</Text>
                      </Text>
                    </View>
                    <View style={styles.budgetRight}>
                      <Text style={[styles.remainingAmount, { color: remaining >= 0 ? Colors.primary : Colors.danger }]}>
                        {remaining >= 0
                          ? `$${remaining.toFixed(2)} left`
                          : `$${Math.abs(remaining).toFixed(2)} over`}
                      </Text>
                      <Text style={styles.pctText}>{pct.toFixed(0)}% used</Text>
                    </View>
                  </View>
                  <View style={styles.budgetTrack}>
                    <View style={[styles.budgetFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: barColor }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {budgets.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="target" size={56} color={Colors.outline} />
            <Text style={styles.emptyText}>No budgets yet</Text>
            <Text style={styles.emptySubText}>
              Set a monthly limit per category and{'\n'}watch your spending stay on track
            </Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={Colors.onPrimary} />
      </TouchableOpacity>

      <AddBudgetSheet sheetRef={sheetRef} editing={editing} onClose={() => setEditing(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 18, paddingBottom: 110 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
  },
  title:    { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },

  // Overview
  overviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  overviewLabel:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  overviewAmount: { color: Colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  overviewLimit:  { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  overviewPct:    { fontSize: 20, fontWeight: '800' },

  overviewTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'visible',
    marginBottom: 8,
  },
  overviewFill: { height: '100%', borderRadius: 5 },
  monthMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: Colors.textSecondary,
  },
  markerHint: { color: Colors.textMuted, fontSize: 11 },

  // Budget cards
  budgetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  budgetCardOver: { borderColor: Colors.danger + '50' },
  budgetTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBody: { flex: 1, gap: 3 },
  catLabel:   { color: Colors.text, fontSize: 15, fontWeight: '700' },
  spentText:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  limitText:  { color: Colors.textMuted, fontWeight: '400' },
  budgetRight:     { alignItems: 'flex-end', gap: 3 },
  remainingAmount: { fontSize: 13, fontWeight: '700' },
  pctText:         { color: Colors.textMuted, fontSize: 11 },

  budgetTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden',
  },
  budgetFill: { height: '100%', borderRadius: 3 },

  // Empty state
  emptyState:   { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText:    { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySubText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // FAB
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
