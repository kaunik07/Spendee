import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, getCategoryById } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useBudgetsContext } from '@/store/BudgetsContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';

const BANK_BLUE    = '#82B1FF';
const CARD_COLOR   = '#E8906A';
const INVEST_COLOR = '#B39DDB';
const WARN_COLOR   = '#FFB74D';

function todayStr() { return new Date().toISOString().split('T')[0]; }

export default function HomeScreen() {
  const router = useRouter();
  const { user }                    = useAuthContext();
  const { netWorth }                = useAccountsContext();
  const { totalOutstanding }        = useCreditCardsContext();
  const { expenses, refresh: refreshExpenses } = useExpenseContext();
  const { budgets, refresh: refreshBudgets }   = useBudgetsContext();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    refreshExpenses();
    refreshBudgets();
    setTimeout(() => setRefreshing(false), 800);
  };

  // ── Card data ────────────────────────────────────────────
  const now      = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today    = todayStr();

  const trueNetWorth = netWorth - totalOutstanding;

  const totalInvested = useMemo(
    () => expenses.filter((e) => e.category === 'investment').reduce((s, e) => s + e.amount, 0),
    [expenses]
  );

  const todayExpenses = useMemo(() => expenses.filter((e) => e.date === today), [expenses, today]);
  const todayTotal    = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Most spent category this month
  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey)) map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    const entries = Object.entries(map).sort(([, a], [, b]) => b - a);
    if (entries.length === 0) return null;
    return { cat: getCategoryById(entries[0][0]), amount: entries[0][1] };
  }, [expenses, monthKey]);

  // Pinned budgets with spend
  const pinnedBudgets = useMemo(() => {
    const spent: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.startsWith(monthKey)) spent[e.category] = (spent[e.category] ?? 0) + e.amount;
    });
    return budgets
      .filter((b) => b.pinned)
      .map((b) => ({ budget: b, spent: spent[b.category] ?? 0 }))
      .sort((a, b) => (b.spent / b.budget.monthlyLimit) - (a.spent / a.budget.monthlyLimit));
  }, [budgets, expenses, monthKey]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>Spendee</Text>
            <Text style={styles.headerSub}>Welcome back, {user?.username ?? 'there'}</Text>
          </View>
          <TouchableOpacity style={styles.avatarBadge} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <Text style={styles.avatarInitials}>
              {user?.username.slice(0, 2).toUpperCase() ?? '??'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Net Worth (hero card) ── */}
        <TouchableOpacity style={styles.heroCard} onPress={() => router.push('/profile')} activeOpacity={0.85}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Net Worth</Text>
              <Text style={[styles.heroAmount, { color: trueNetWorth >= 0 ? Colors.primary : Colors.danger }]}>
                {trueNetWorth < 0 ? '−' : ''}${Math.abs(trueNetWorth).toFixed(2)}
              </Text>
            </View>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="wallet-outline" size={26} color={Colors.primary} />
            </View>
          </View>
          <View style={styles.heroBreakdown}>
            <View style={styles.heroChip}>
              <View style={[styles.chipDot, { backgroundColor: BANK_BLUE }]} />
              <Text style={styles.heroChipText}>Bank  <Text style={{ color: BANK_BLUE }}>+${netWorth.toFixed(2)}</Text></Text>
            </View>
            <View style={styles.heroChip}>
              <View style={[styles.chipDot, { backgroundColor: CARD_COLOR }]} />
              <Text style={styles.heroChipText}>Cards  <Text style={{ color: CARD_COLOR }}>−${totalOutstanding.toFixed(2)}</Text></Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Investment + Today (side by side) ── */}
        <View style={styles.gridRow}>
          <View style={[styles.gridCard, { borderColor: INVEST_COLOR + '40' }]}>
            <View style={[styles.gridIcon, { backgroundColor: INVEST_COLOR + '20' }]}>
              <MaterialCommunityIcons name="chart-line-variant" size={19} color={INVEST_COLOR} />
            </View>
            <Text style={styles.gridLabel}>Invested</Text>
            <Text style={[styles.gridAmount, { color: INVEST_COLOR }]}>${totalInvested.toFixed(2)}</Text>
            <Text style={styles.gridSub}>all time</Text>
          </View>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => router.push('/expenses')}
            activeOpacity={0.8}>
            <View style={[styles.gridIcon, { backgroundColor: Colors.danger + '20' }]}>
              <MaterialCommunityIcons name="calendar-today" size={19} color={Colors.danger} />
            </View>
            <Text style={styles.gridLabel}>Today</Text>
            <Text style={[styles.gridAmount, { color: Colors.danger }]}>-${todayTotal.toFixed(2)}</Text>
            <Text style={styles.gridSub}>
              {todayExpenses.length} expense{todayExpenses.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Most spent category (this month) ── */}
        <TouchableOpacity style={styles.wideCard} onPress={() => router.push('/summary')} activeOpacity={0.8}>
          {topCategory ? (
            <>
              <View style={[styles.gridIcon, { backgroundColor: topCategory.cat.color + '20' }]}>
                <MaterialCommunityIcons name={topCategory.cat.icon as any} size={20} color={topCategory.cat.color} />
              </View>
              <View style={styles.wideBody}>
                <Text style={styles.gridLabel}>Most spent this month</Text>
                <Text style={[styles.wideCategory, { color: topCategory.cat.color }]}>{topCategory.cat.label}</Text>
              </View>
              <Text style={[styles.wideAmount, { color: topCategory.cat.color }]}>
                ${topCategory.amount.toFixed(2)}
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.gridIcon, { backgroundColor: Colors.surfaceContainer }]}>
                <MaterialCommunityIcons name="chart-donut" size={20} color={Colors.outline} />
              </View>
              <View style={styles.wideBody}>
                <Text style={styles.gridLabel}>Most spent this month</Text>
                <Text style={styles.wideEmpty}>No expenses yet this month</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* ── Pinned budgets ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Budget Remaining</Text>
          <TouchableOpacity onPress={() => router.push('/budget')} hitSlop={8}>
            <Text style={styles.sectionLink}>Manage</Text>
          </TouchableOpacity>
        </View>

        {pinnedBudgets.length === 0 ? (
          <TouchableOpacity style={styles.pinHintCard} onPress={() => router.push('/budget')} activeOpacity={0.8}>
            <MaterialCommunityIcons name="pin-outline" size={20} color={Colors.outline} />
            <Text style={styles.pinHintText}>
              Pin budgets from the Budget tab to track them here
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />
          </TouchableOpacity>
        ) : (
          pinnedBudgets.map(({ budget, spent }) => {
            const cat = getCategoryById(budget.category);
            const pct = (spent / budget.monthlyLimit) * 100;
            const remaining = budget.monthlyLimit - spent;
            const barColor = pct >= 100 ? Colors.danger : pct >= 80 ? WARN_COLOR : cat.color;
            return (
              <TouchableOpacity
                key={budget.id}
                style={styles.budgetCard}
                onPress={() => router.push('/budget')}
                activeOpacity={0.8}>
                <View style={styles.budgetTop}>
                  <View style={[styles.budgetIcon, { backgroundColor: cat.color + '20' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={17} color={cat.color} />
                  </View>
                  <Text style={styles.budgetLabel}>{cat.label}</Text>
                  <Text style={[styles.budgetRemaining, { color: remaining >= 0 ? Colors.primary : Colors.danger }]}>
                    {remaining >= 0
                      ? `$${remaining.toFixed(2)} left`
                      : `$${Math.abs(remaining).toFixed(2)} over`}
                  </Text>
                </View>
                <View style={styles.budgetTrack}>
                  <View style={[styles.budgetFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: barColor }]} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 18, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
  },
  appName:   { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
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

  // Hero card
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    gap: 16,
  },
  heroTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  heroAmount: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBreakdown: { flexDirection: 'row', gap: 10 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipDot:      { width: 7, height: 7, borderRadius: 4 },
  heroChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },

  // 2-column grid
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gridCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  gridIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  gridLabel:  { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  gridAmount: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  gridSub:    { color: Colors.textMuted, fontSize: 11 },

  // Wide card (most spent)
  wideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wideBody:     { flex: 1, gap: 3 },
  wideCategory: { fontSize: 17, fontWeight: '800' },
  wideAmount:   { fontSize: 18, fontWeight: '800' },
  wideEmpty:    { color: Colors.textMuted, fontSize: 14 },

  // Pinned budgets
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sectionLink:  { color: Colors.primary, fontSize: 13, fontWeight: '600' },

  pinHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  pinHintText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },

  budgetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  budgetTop:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  budgetIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetLabel:     { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  budgetRemaining: { fontSize: 13, fontWeight: '700' },
  budgetTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden',
  },
  budgetFill: { height: '100%', borderRadius: 3 },
});
