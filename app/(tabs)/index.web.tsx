// Web override of the Home dashboard. Same data/hooks as index.tsx (mobile),
// laid out per the approved sidebar + multi-column dashboard design instead
// of a single-column card stack.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors, getCategoryById } from '@/constants/theme';
import { dueLabel } from '@/lib/billing';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useBudgetsContext } from '@/store/BudgetsContext';
import { computeDueReminders, getSettled, rescheduleCardReminders, settleCardCycle } from '@/store/ccReminders';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';

const WARN_COLOR = '#FFB74D';

function todayStr() { return new Date().toISOString().split('T')[0]; }

export default function HomeScreenWeb() {
  const router = useRouter();
  const { user }                    = useAuthContext();
  const { netWorth }                = useAccountsContext();
  const { cards, totalOutstanding } = useCreditCardsContext();
  const { expenses }                = useExpenseContext();
  const { budgets }                 = useBudgetsContext();

  const [settled, setSettled] = useState<Record<string, string>>({});
  const [dueDismissed, setDueDismissed] = useState<Set<string>>(new Set());

  const billingSig = cards.map((c) => `${c.id}:${c.billingDay}`).join(',');
  useEffect(() => {
    if (!user?.id) return;
    getSettled(user.id).then(setSettled);
    rescheduleCardReminders(user.id, cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, billingSig]);

  const dueReminders = useMemo(
    () => computeDueReminders(cards, settled).filter((r) => !dueDismissed.has(r.card.id)),
    [cards, settled, dueDismissed]
  );

  const handleSettle = async (cardId: string, dueStr: string) => {
    if (!user?.id) return;
    await settleCardCycle(user.id, cardId, dueStr);
    setSettled(await getSettled(user.id));
    rescheduleCardReminders(user.id, cards);
  };

  const now      = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today    = todayStr();

  const totalInvested = useMemo(
    () => expenses.filter((e) => e.category === 'investment').reduce((s, e) => s + e.amount, 0),
    [expenses]
  );

  const liquidNetWorth = netWorth - totalOutstanding;
  const totalNetWorth  = liquidNetWorth + totalInvested;

  const todayExpenses = useMemo(() => expenses.filter((e) => e.date === today), [expenses, today]);
  const todayTotal    = todayExpenses.reduce((s, e) => s + e.amount, 0);

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey) && e.category !== 'investment') {
        map[e.category] = (map[e.category] ?? 0) + e.amount;
      }
    });
    const entries = Object.entries(map).sort(([, a], [, b]) => b - a);
    if (entries.length === 0) return null;
    return { cat: getCategoryById(entries[0][0]), amount: entries[0][1] };
  }, [expenses, monthKey]);

  const recentExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [expenses]
  );

  const pinnedBudgets = useMemo(() => {
    const spent: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey)) spent[e.category] = (spent[e.category] ?? 0) + e.amount;
    });
    return budgets
      .filter((b) => b.pinned)
      .map((b) => ({ budget: b, spent: spent[b.category] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget.monthlyLimit) - (a.spent / a.budget.monthlyLimit))
      .slice(0, 5);
  }, [budgets, expenses, monthKey]);

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Welcome back{user?.username ? `, ${user.username}` : ''}</Text>
          <Text style={styles.sub}>Here's where things stand today</Text>
        </View>
      </View>

      {dueReminders.map((r) => (
        <View key={r.card.id} style={styles.dueBanner}>
          <Text style={styles.dueBannerText}>
            <Text style={{ fontWeight: '800' }}>{r.card.name}</Text> payment {dueLabel(r.days)} — last date to pay{' '}
            {r.due.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
          <View style={styles.dueBannerActions}>
            <Text style={styles.settleBtn} onPress={() => handleSettle(r.card.id, r.dueStr)}>Settle</Text>
            <Text
              style={styles.dismissBtn}
              onPress={() => setDueDismissed((prev) => new Set(prev).add(r.card.id))}>
              Dismiss
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.statRow}>
        <WebStatCard
          label="Net Worth"
          value={`${totalNetWorth < 0 ? '−' : ''}$${Math.abs(totalNetWorth).toFixed(2)}`}
          valueColor={totalNetWorth >= 0 ? Colors.primary : Colors.danger}
          note={`Liquid: ${liquidNetWorth < 0 ? '−' : ''}$${Math.abs(liquidNetWorth).toFixed(2)}`}
          onPress={() => router.push('/profile')}
        />
        <WebStatCard
          label="Invested"
          value={`$${totalInvested.toFixed(2)}`}
          note="All time"
        />
        <WebStatCard
          label="Today's Spend"
          value={`-$${todayTotal.toFixed(2)}`}
          valueColor={Colors.danger}
          note={`${todayExpenses.length} expense${todayExpenses.length !== 1 ? 's' : ''}`}
          onPress={() => router.push('/expenses')}
        />
        <WebStatCard
          label="Top Category"
          value={topCategory ? `${topCategory.cat.label}` : 'No spend yet'}
          valueColor={topCategory ? topCategory.cat.color : undefined}
          note={topCategory ? `$${topCategory.amount.toFixed(2)} this month` : undefined}
          onPress={() => router.push('/summary')}
        />
      </View>

      <View style={styles.cols}>
        <WebPanel title="Recent Expenses" linkLabel="View all" onLinkPress={() => router.push('/expenses')} style={{ flex: 1.6 }}>
          {recentExpenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses yet</Text>
          ) : (
            recentExpenses.map((e) => {
              const cat = getCategoryById(e.category);
              return (
                <View key={e.id} style={styles.expenseRow}>
                  <View style={[styles.expenseIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
                  </View>
                  <View style={styles.expenseMid}>
                    <Text style={styles.expenseName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.expenseCat}>{cat.label}</Text>
                  </View>
                  <Text style={styles.expenseAmt}>-${e.amount.toFixed(2)}</Text>
                </View>
              );
            })
          )}
        </WebPanel>

        <WebPanel title="Budget Remaining" linkLabel="Budget" onLinkPress={() => router.push('/budget')} style={{ flex: 1 }}>
          {pinnedBudgets.length === 0 ? (
            <Text style={styles.emptyText}>Pin budgets from the Budget tab to track them here</Text>
          ) : (
            pinnedBudgets.map(({ budget, spent }) => {
              const cat = getCategoryById(budget.category);
              const pct = (spent / budget.monthlyLimit) * 100;
              const barColor = pct >= 100 ? Colors.danger : pct >= 80 ? WARN_COLOR : cat.color;
              return (
                <View key={budget.id} style={styles.budgetRow}>
                  <View style={styles.budgetTop}>
                    <Text style={styles.budgetCat}>{cat.label}</Text>
                    <Text style={styles.budgetAmt}>${spent.toFixed(0)} / ${budget.monthlyLimit.toFixed(0)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: barColor }]} />
                  </View>
                </View>
              );
            })
          )}
        </WebPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { marginBottom: 24 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2 },

  dueBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: WARN_COLOR + '18', borderWidth: 1, borderColor: WARN_COLOR + '40',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
  },
  dueBannerText: { color: Colors.text, fontSize: 13, flex: 1 },
  dueBannerActions: { flexDirection: 'row', gap: 14, marginLeft: 12 },
  settleBtn: { color: WARN_COLOR, fontWeight: '800', fontSize: 12.5, cursor: 'pointer' as any },
  dismissBtn: { color: Colors.outline, fontWeight: '700', fontSize: 12.5, cursor: 'pointer' as any },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  cols: { flexDirection: 'row', gap: 20 },

  emptyText: { color: Colors.outline, fontSize: 13 },

  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  expenseIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseMid: { flex: 1, minWidth: 0 },
  expenseName: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  expenseCat: { color: Colors.outline, fontSize: 11.5, marginTop: 1 },
  expenseAmt: { color: Colors.text, fontSize: 13.5, fontWeight: '700' },

  budgetRow: { marginBottom: 14 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetCat: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  budgetAmt: { color: Colors.outline, fontSize: 12 },
  barTrack: { height: 7, borderRadius: 6, backgroundColor: Colors.background, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
});
