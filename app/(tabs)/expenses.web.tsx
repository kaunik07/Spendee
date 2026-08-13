// Web override of the Expenses list. Same data/hooks as expenses.tsx
// (mobile); date-grouped panel (Today highlighted first) instead of a flat
// card list, "+ Add Expense" triggers the same AddExpenseSheet component
// (its chrome branches to WebDrawer on web internally — see
// components/AddExpenseSheet.tsx).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AddExpenseSheet from '@/components/AddExpenseSheet';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import EditExpenseDrawer from '@/components/web/EditExpenseDrawer';
import WebDrawer from '@/components/web/WebDrawer';
import WebPanel from '@/components/web/WebPanel';
import { getSubcategoryById } from '@/constants/subcategories';
import { Categories, Colors, getCategoryById } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useExpenseActions } from '@/store/useExpenseActions';
import { Expense } from '@/store/useExpenses';

const PENDING_AMBER = '#FFB74D';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }
function todayStr() { return toDateStr(new Date()); }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return toDateStr(d); }
function monthsAgoStr(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); return toDateStr(d); }
function formatShort(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' });
}
function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

type DatePresetKey = '7d' | '30d' | '1m' | '3m';
type DateRangeMode = 'all' | 'preset' | 'month' | 'custom';

const DATE_PRESETS: { key: DatePresetKey; label: string; shortLabel: string; days?: number; months?: number }[] = [
  { key: '7d',  label: '7 days',   shortLabel: 'Last 7 days',   days: 7 },
  { key: '30d', label: '30 days',  shortLabel: 'Last 30 days',  days: 30 },
  { key: '1m',  label: '1 month',  shortLabel: 'Last month',    months: 1 },
  { key: '3m',  label: '3 months', shortLabel: 'Last 3 months', months: 3 },
];

export default function ExpensesScreenWeb() {
  const sheetRef = useRef<BottomSheet>(null);
  const { expenses, pendingCount, syncing } = useExpenseContext();
  const { deleteExpenseWithReversal } = useExpenseActions();
  const today = todayStr();

  // Editing happens in the right-side drawer (same chrome as Add Expense)
  // rather than navigating to a separate page.
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const activeCats = filterCategories.map(getCategoryById);

  const toggleCategory = (id: string) => {
    setFilterCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  // ── Date range filter (All time by default — doesn't hide anything
  // unless the user actively picks a range) ──
  const now = new Date();
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('all');
  const [datePresetKey, setDatePresetKey] = useState<DatePresetKey>('30d');
  const [dateSelectedMonth, setDateSelectedMonth] = useState(now.getMonth());
  const [dateYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(daysAgoStr(29));
  const [customEnd, setCustomEnd]     = useState(todayStr());

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [datePopoverPos, setDatePopoverPos]   = useState({ top: 0, left: 0 });
  const [pickingCustom, setPickingCustom]     = useState<'start' | 'end' | null>(null);
  const datePillRef = useRef<View>(null);

  const openDatePopover = () => {
    datePillRef.current?.measureInWindow((x, y, _w, height) => {
      setDatePopoverPos({ top: y + height + 8, left: x });
      setDatePopoverOpen(true);
    });
  };

  const dateRange = useMemo(() => {
    if (dateRangeMode === 'all') return null;
    if (dateRangeMode === 'preset') {
      const preset = DATE_PRESETS.find((p) => p.key === datePresetKey)!;
      const s = preset.days ? daysAgoStr(preset.days - 1) : monthsAgoStr(preset.months!);
      return { start: s, end: todayStr() };
    }
    if (dateRangeMode === 'month') {
      const s = `${dateYear}-${String(dateSelectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(dateYear, dateSelectedMonth + 1, 0).getDate();
      const e = `${dateYear}-${String(dateSelectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start: s, end: e };
    }
    return { start: customStart, end: customEnd };
  }, [dateRangeMode, datePresetKey, dateSelectedMonth, dateYear, customStart, customEnd]);

  const datePillLabel = dateRangeMode === 'all'
    ? 'All time'
    : dateRangeMode === 'preset'
      ? DATE_PRESETS.find((p) => p.key === datePresetKey)!.shortLabel
      : dateRangeMode === 'month'
        ? `${MONTH_NAMES[dateSelectedMonth]} ${dateYear}`
        : dateRange!.start === dateRange!.end ? formatShort(dateRange!.start) : `${formatShort(dateRange!.start)} – ${formatShort(dateRange!.end)}`;

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthTotal = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);

  const anyFilterActive = filterCategories.length > 0 || dateRangeMode !== 'all';

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (filterCategories.length > 0) result = result.filter((e) => filterCategories.includes(e.category));
    if (dateRange) result = result.filter((e) => e.date >= dateRange.start && e.date <= dateRange.end);
    return result;
  }, [expenses, filterCategories, dateRange]);

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
        <Pressable ref={datePillRef} style={styles.filterChip} onPress={openDatePopover}>
          <MaterialCommunityIcons name="calendar-range" size={14} color={dateRangeMode !== 'all' ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.filterChipText, dateRangeMode !== 'all' && { color: Colors.primary }]}>{datePillLabel}</Text>
          <MaterialCommunityIcons name="chevron-down" size={13} color={dateRangeMode !== 'all' ? Colors.primary : Colors.textSecondary} />
        </Pressable>
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
        {anyFilterActive && (
          <Pressable onPress={() => { setFilterCategories([]); setDateRangeMode('all'); }} hitSlop={8} style={styles.clearAllBtn}>
            <Text style={styles.clearAllText}>Clear all</Text>
          </Pressable>
        )}
      </View>

      <WebPanel
        title="Transactions"
        linkLabel={anyFilterActive ? `${filteredExpenses.length} of ${expenses.length}` : `${expenses.length} total`}>
        {expenses.length === 0 ? (
          <Text style={styles.emptyText}>No expenses yet — add your first one above.</Text>
        ) : filteredExpenses.length === 0 ? (
          <Text style={styles.emptyText}>No expenses match the current filters.</Text>
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
                    onOpen={() => setEditingId(item.id)}
                  />
                ))}
              </View>
            );
          })
        )}
      </WebPanel>

      <AddExpenseSheet sheetRef={sheetRef} />
      <EditExpenseDrawer
        expenseId={editingId}
        visible={editingId !== null}
        onClose={() => setEditingId(null)}
      />
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

      {/* Date-range popover — floats over the page (transparent Modal
          positioned under the pill), doesn't push content down. */}
      <Modal transparent visible={datePopoverOpen} animationType="fade" onRequestClose={() => setDatePopoverOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDatePopoverOpen(false)}>
          <Pressable style={[styles.datePopover, { top: datePopoverPos.top, left: datePopoverPos.left }]} onPress={() => {}}>
            <Pressable
              style={[styles.presetChip, dateRangeMode === 'all' && styles.presetChipSelected, { marginBottom: 14 }]}
              onPress={() => { setDateRangeMode('all'); setDatePopoverOpen(false); }}>
              <Text style={[styles.presetChipText, dateRangeMode === 'all' && styles.presetChipTextSelected]}>All time</Text>
            </Pressable>

            <Text style={styles.popSectionLabel}>Quick range</Text>
            <View style={styles.presetRow}>
              {DATE_PRESETS.map((p) => {
                const selected = dateRangeMode === 'preset' && datePresetKey === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.presetChip, selected && styles.presetChipSelected]}
                    onPress={() => { setDateRangeMode('preset'); setDatePresetKey(p.key); setDatePopoverOpen(false); }}>
                    <Text style={[styles.presetChipText, selected && styles.presetChipTextSelected]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.popSectionLabel}>Or pick a month</Text>
            <View style={styles.monthGrid}>
              {MONTH_ABBR.map((label, m) => {
                const selected = dateRangeMode === 'month' && dateSelectedMonth === m;
                return (
                  <Pressable
                    key={label}
                    style={[styles.monthChip, selected && styles.monthChipSelected]}
                    onPress={() => { setDateRangeMode('month'); setDateSelectedMonth(m); setDatePopoverOpen(false); }}>
                    <Text style={[styles.monthChipText, selected && styles.monthChipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.popSectionLabel}>Or a custom range</Text>
            <View style={styles.customRow}>
              <Pressable style={styles.dateInput} onPress={() => setPickingCustom('start')}>
                <Text style={styles.dateInputText}>{formatShort(dateRangeMode === 'custom' ? customStart : daysAgoStr(29))}</Text>
              </Pressable>
              <MaterialCommunityIcons name="arrow-right" size={15} color={Colors.outline} />
              <Pressable style={styles.dateInput} onPress={() => setPickingCustom('end')}>
                <Text style={styles.dateInputText}>{formatShort(dateRangeMode === 'custom' ? customEnd : todayStr())}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <WebDatePickerModal
        visible={pickingCustom === 'start'}
        date={customStart}
        maxDate={customEnd}
        onSelect={(d) => { setCustomStart(d); setDateRangeMode('custom'); setPickingCustom(null); }}
        onClose={() => setPickingCustom(null)}
      />
      <WebDatePickerModal
        visible={pickingCustom === 'end'}
        date={customEnd}
        maxDate={todayStr()}
        onSelect={(d) => { setCustomEnd(d); setDateRangeMode('custom'); setPickingCustom(null); setDatePopoverOpen(false); }}
        onClose={() => setPickingCustom(null)}
      />
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

  backdrop: { flex: 1 },
  datePopover: {
    position: 'absolute',
    width: 440,
    maxWidth: '92%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 12,
  },
  popSectionLabel: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 8 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  presetChip: { flex: 1, alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 9 },
  presetChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  presetChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  presetChipTextSelected: { color: Colors.onPrimary },

  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  monthChip: { width: '15%', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, paddingVertical: 8 },
  monthChipSelected: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  monthChipText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '700' },
  monthChipTextSelected: { color: Colors.primary },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateInput: { flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  dateInputText: { color: Colors.text, fontSize: 12.5, fontWeight: '600' },
});
