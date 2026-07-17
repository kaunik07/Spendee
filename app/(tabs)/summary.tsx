import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { getSubcategoryById } from '@/constants/subcategories';
import { Colors, getCategoryById } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { Expense } from '@/store/useExpenses';

const H_PAD = 18;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CARD_W   = 96;
const CARD_GAP = 10;

function todayStr() { return new Date().toISOString().split('T')[0]; }

type Granularity = 'day' | 'month';
type ViewMode    = 'breakdown' | 'list';

export default function SummaryScreen() {
  const { expenses, refresh } = useExpenseContext();

  const now = new Date();
  const [granularity,   setGranularity]   = useState<Granularity>('month');
  const [viewMode,      setViewMode]      = useState<ViewMode>('breakdown');
  const [selectedDate,  setSelectedDate]  = useState(todayStr());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0–11
  const [currentYear]                     = useState(now.getFullYear());

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  // ── Derived data ─────────────────────────────────────────
  const monthKey = `${currentYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const filtered = useMemo(
    () => granularity === 'month'
      ? expenses.filter((e) => e.date.startsWith(monthKey))
      : expenses.filter((e) => e.date === selectedDate),
    [expenses, granularity, monthKey, selectedDate]
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // Per-month totals for the card strip
  const monthTotals = useMemo(() => {
    const totals = Array(12).fill(0) as number[];
    expenses.forEach((e) => {
      if (e.date.startsWith(String(currentYear))) {
        const m = parseInt(e.date.slice(5, 7), 10) - 1;
        if (m >= 0 && m < 12) totals[m] += e.amount;
      }
    });
    return totals;
  }, [expenses, currentYear]);

  // Calendar dot markers
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    expenses.forEach((e) => { marks[e.date] = { marked: true, dotColor: Colors.primary }; });
    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: Colors.primary,
      selectedTextColor: Colors.onPrimary,
    };
    return marks;
  }, [expenses, selectedDate]);

  const selectionLabel = granularity === 'month'
    ? `${MONTH_NAMES[selectedMonth]} ${currentYear}`
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('default', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Summary</Text>
        <View style={styles.toggle}>
          {(['day', 'month'] as Granularity[]).map((g) => {
            const active = granularity === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.toggleBtn, active && styles.toggleActive]}
                onPress={() => setGranularity(g)}>
                <MaterialCommunityIcons
                  name={g === 'day' ? 'calendar-today' : 'calendar-month'}
                  size={14}
                  color={active ? Colors.onPrimary : Colors.outline}
                />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {g === 'day' ? 'Day' : 'Month'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}>

        {/* Period selector: month cards OR calendar */}
        {granularity === 'month' ? (
          <MonthCardStrip
            monthTotals={monthTotals}
            selectedMonth={selectedMonth}
            currentMonth={now.getMonth()}
            year={currentYear}
            onSelect={setSelectedMonth}
          />
        ) : (
          <Calendar
            onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            theme={{
              backgroundColor: Colors.background,
              calendarBackground: Colors.surface,
              textSectionTitleColor: Colors.textSecondary,
              selectedDayBackgroundColor: Colors.primary,
              selectedDayTextColor: Colors.onPrimary,
              todayTextColor: Colors.primary,
              dayTextColor: Colors.text,
              textDisabledColor: Colors.textMuted,
              dotColor: Colors.primary,
              selectedDotColor: Colors.onPrimary,
              arrowColor: Colors.primary,
              monthTextColor: Colors.text,
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
            }}
            style={styles.calendar}
          />
        )}

        {/* Selection summary line */}
        <View style={styles.selectionHeader}>
          <View>
            <Text style={styles.selectionLabel}>{selectionLabel}</Text>
            <Text style={styles.selectionCount}>
              {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {total > 0 && (
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>-${total.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Breakdown / Expenses view switch */}
        <View style={styles.viewToggle}>
          {([
            { mode: 'breakdown', label: 'Breakdown', icon: 'chart-donut' },
            { mode: 'list',      label: 'Expenses',  icon: 'format-list-bulleted' },
          ] as { mode: ViewMode; label: string; icon: string }[]).map(({ mode, label, icon }) => {
            const active = viewMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.viewToggleBtn, active && styles.viewToggleActive]}
                onPress={() => setViewMode(mode)}
                activeOpacity={0.8}>
                <MaterialCommunityIcons name={icon as any} size={15} color={active ? Colors.primary : Colors.outline} />
                <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        {filtered.length === 0 ? (
          <View style={styles.noExpenses}>
            <MaterialCommunityIcons
              name={granularity === 'month' ? 'chart-donut' : 'calendar-blank-outline'}
              size={44}
              color={Colors.outline}
            />
            <Text style={styles.noExpensesText}>
              No expenses {granularity === 'month' ? 'this month' : 'on this day'}
            </Text>
          </View>
        ) : viewMode === 'breakdown' ? (
          <CategoryBreakdown expenses={filtered} total={total} />
        ) : (
          <View>
            {filtered.map((item) => (
              <DayExpenseRow key={item.id} item={item} showDate={granularity === 'month'} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Month card strip ─────────────────────────────────────
function MonthCardStrip({
  monthTotals, selectedMonth, currentMonth, year, onSelect,
}: {
  monthTotals: number[];
  selectedMonth: number;
  currentMonth: number;
  year: number;
  onSelect: (m: number) => void;
}) {
  const listRef = useRef<FlatList<number>>(null);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={Array.from({ length: 12 }, (_, i) => i)}
      keyExtractor={(m) => MONTH_ABBR[m]}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.monthStrip}
      initialScrollIndex={Math.max(0, selectedMonth - 1)}
      getItemLayout={(_, index) => ({
        length: CARD_W + CARD_GAP,
        offset: (CARD_W + CARD_GAP) * index,
        index,
      })}
      renderItem={({ item: m }) => {
        const selected  = m === selectedMonth;
        const isCurrent = m === currentMonth;
        const amt       = monthTotals[m];
        return (
          <TouchableOpacity
            style={[styles.monthCard, selected && styles.monthCardSelected]}
            onPress={() => onSelect(m)}
            activeOpacity={0.8}>
            {isCurrent && <View style={styles.currentDot} />}
            <Text style={[styles.monthCardName, selected && { color: Colors.primary }]}>
              {MONTH_ABBR[m]}
            </Text>
            <Text style={styles.monthCardYear}>{year}</Text>
            <Text style={[styles.monthCardTotal, selected && { color: Colors.danger }]}>
              {amt > 0 ? `$${amt.toFixed(0)}` : '—'}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Category breakdown ───────────────────────────────────
function CategoryBreakdown({ expenses, total }: { expenses: Expense[]; total: number }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const slices = useMemo(() => {
    const map: Record<string, { amount: number; subs: Record<string, number>; hasSubData: boolean }> = {};
    expenses.forEach((e) => {
      const g = (map[e.category] ??= { amount: 0, subs: {}, hasSubData: false });
      g.amount += e.amount;
      const key = e.subcategory ?? '__none__';
      g.subs[key] = (g.subs[key] ?? 0) + e.amount;
      if (e.subcategory) g.hasSubData = true;
    });
    return Object.entries(map)
      .map(([id, g]) => ({ catId: id, cat: getCategoryById(id), ...g }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const toggle = (catId: string) =>
    setExpanded((prev) => ({ ...prev, [catId]: !prev[catId] }));

  return (
    <View style={styles.breakdownCard}>
      {/* Stacked bar */}
      <View style={styles.stackedBar}>
        {slices.map(({ cat, catId, amount }, i) => (
          <View
            key={catId}
            style={{
              flex: amount / total,
              backgroundColor: cat.color,
              borderTopLeftRadius: i === 0 ? 5 : 0,
              borderBottomLeftRadius: i === 0 ? 5 : 0,
              borderTopRightRadius: i === slices.length - 1 ? 5 : 0,
              borderBottomRightRadius: i === slices.length - 1 ? 5 : 0,
            }}
          />
        ))}
      </View>

      {/* Per-category rows */}
      {slices.map(({ cat, catId, amount, subs, hasSubData }, i) => {
        const pct    = (amount / total) * 100;
        const isOpen = !!expanded[catId];
        const subRows = isOpen
          ? Object.entries(subs)
              .map(([subId, subAmount]) => ({
                subId,
                subAmount,
                label: subId === '__none__'
                  ? 'Unspecified'
                  : getSubcategoryById(catId, subId)?.label ?? subId,
              }))
              .sort((a, b) => b.subAmount - a.subAmount)
          : [];

        return (
          <View key={catId} style={i < slices.length - 1 && !isOpen ? styles.catRowDivider : undefined}>
            <TouchableOpacity
              style={styles.catRow}
              onPress={() => hasSubData && toggle(catId)}
              activeOpacity={hasSubData ? 0.7 : 1}>
              <View style={[styles.catIcon, { backgroundColor: cat.color + '20' }]}>
                <MaterialCommunityIcons name={cat.icon as any} size={18} color={cat.color} />
              </View>
              <View style={styles.catBody}>
                <Text style={styles.catLabel}>{cat.label}</Text>
                <View style={styles.catBarTrack}>
                  <View style={[styles.catBarFill, { width: `${pct}%` as any, backgroundColor: cat.color }]} />
                </View>
              </View>
              <View style={styles.catRight}>
                <Text style={[styles.catAmount, { color: cat.color }]}>${amount.toFixed(2)}</Text>
                <Text style={styles.catPct}>{pct.toFixed(1)}%</Text>
              </View>
              {hasSubData && (
                <MaterialCommunityIcons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color={Colors.outline}
                />
              )}
            </TouchableOpacity>

            {/* Subcategory breakdown */}
            {isOpen && (
              <View style={[styles.subList, i < slices.length - 1 && styles.catRowDivider]}>
                {subRows.map(({ subId, subAmount, label }) => (
                  <View key={subId} style={styles.subRow}>
                    <View style={[styles.subDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.subLabel}>{label}</Text>
                    <Text style={styles.subPct}>{((subAmount / amount) * 100).toFixed(0)}%</Text>
                    <Text style={[styles.subAmount, { color: cat.color }]}>${subAmount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Expense row ──────────────────────────────────────────
function DayExpenseRow({ item, showDate }: { item: Expense; showDate?: boolean }) {
  const cat = getCategoryById(item.category);
  return (
    <View style={styles.expenseCard}>
      <View style={[styles.expenseIconWrap, { backgroundColor: cat.color + '20' }]}>
        <MaterialCommunityIcons name={cat.icon as any} size={20} color={cat.color} />
      </View>
      <View style={styles.expenseBody}>
        <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.expenseCat, { color: cat.color }]}>{cat.label}</Text>
        {item.note ? <Text style={styles.expenseNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>-${item.amount.toFixed(2)}</Text>
        {showDate && (
          <Text style={styles.expenseDate}>
            {new Date(item.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },

  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  toggleActive: { backgroundColor: Colors.primary },
  toggleText: { color: Colors.outline, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: Colors.onPrimary },

  scrollContent: { paddingBottom: 60 },

  calendar: {
    marginHorizontal: H_PAD,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Month card strip
  monthStrip: { paddingHorizontal: H_PAD, gap: CARD_GAP, paddingVertical: 4 },
  monthCard: {
    width: CARD_W,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  monthCardSelected: {
    borderColor: Colors.primary + '70',
    backgroundColor: Colors.primaryMuted,
  },
  currentDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  monthCardName:  { color: Colors.text, fontSize: 17, fontWeight: '800' },
  monthCardYear:  { color: Colors.textMuted, fontSize: 10 },
  monthCardTotal: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 4 },

  // Selection summary
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    marginTop: 18,
    marginBottom: 12,
  },
  selectionLabel: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  selectionCount: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  totalBadge: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  totalBadgeText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },

  // View toggle
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: H_PAD,
    marginBottom: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  viewToggleActive:     { backgroundColor: Colors.primaryMuted },
  viewToggleText:       { color: Colors.outline, fontSize: 13, fontWeight: '600' },
  viewToggleTextActive: { color: Colors.primary },

  // Breakdown
  breakdownCard: {
    marginHorizontal: H_PAD,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: Colors.surfaceContainer,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  catRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBody:  { flex: 1, gap: 6 },
  catLabel: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  catBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden',
  },
  catBarFill: { height: '100%', borderRadius: 2 },
  catRight:   { alignItems: 'flex-end', gap: 2 },
  catAmount:  { fontSize: 14, fontWeight: '700' },
  catPct:     { color: Colors.textMuted, fontSize: 11 },

  subList: { paddingLeft: 48, paddingBottom: 10, gap: 8 },
  subRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subDot:  { width: 6, height: 6, borderRadius: 3, opacity: 0.7 },
  subLabel:  { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  subPct:    { color: Colors.textMuted, fontSize: 11 },
  subAmount: { fontSize: 13, fontWeight: '600', minWidth: 64, textAlign: 'right' },

  // Empty + expense rows
  noExpenses:     { alignItems: 'center', paddingTop: 36, gap: 10 },
  noExpensesText: { color: Colors.textMuted, fontSize: 14 },

  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    marginHorizontal: H_PAD,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  expenseIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expenseBody:    { flex: 1, gap: 2 },
  expenseName:    { color: Colors.text, fontSize: 15, fontWeight: '700' },
  expenseCat:     { fontSize: 12, fontWeight: '600' },
  expenseNote:    { color: Colors.textSecondary, fontSize: 12 },
  expenseRight:   { alignItems: 'flex-end', gap: 3 },
  expenseAmount:  { color: Colors.danger, fontSize: 15, fontWeight: '700' },
  expenseDate:    { color: Colors.textMuted, fontSize: 11 },
});
