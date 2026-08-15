// Web override of the Summary tab. Same expense data as summary.tsx
// (mobile). Period selection is a single pill that opens a floating
// popover (react-native Modal, absolutely positioned under the pill via
// measureInWindow — floats over the page instead of pushing content down)
// offering three ways to pick a period: quick rolling presets, a specific
// calendar month, or a custom start/end range. Content below (donut +
// legend + itemized category cards) is always full width.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import WebDonutChart from '@/components/web/WebDonutChart';
import WebPanel from '@/components/web/WebPanel';
import { Colors, getCategoryById } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { Expense } from '@/store/useExpenses';
import { formatSignedAmount } from '@/lib/money';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }
function todayStr() { return toDateStr(new Date()); }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return toDateStr(d); }
function monthsAgoStr(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); return toDateStr(d); }
function formatShort(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

type PresetKey = '7d' | '30d' | '1m' | '3m';
type RangeMode = 'preset' | 'month' | 'custom';

const PRESETS: { key: PresetKey; label: string; shortLabel: string; days?: number; months?: number }[] = [
  { key: '7d',  label: '7 days',  shortLabel: 'Last 7 days',  days: 7 },
  { key: '30d', label: '30 days', shortLabel: 'Last 30 days', days: 30 },
  { key: '1m',  label: '1 month', shortLabel: 'Last month',   months: 1 },
  { key: '3m',  label: '3 months', shortLabel: 'Last 3 months', months: 3 },
];

interface CategoryGroup {
  catId: string;
  amount: number;
  items: Expense[];
}

export default function SummaryScreenWeb() {
  const { expenses } = useExpenseContext();
  const now = new Date();

  const [rangeMode, setRangeMode]   = useState<RangeMode>('preset');
  const [presetKey, setPresetKey]   = useState<PresetKey>('30d');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [currentYear]               = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(daysAgoStr(29));
  const [customEnd, setCustomEnd]     = useState(todayStr());

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos]   = useState({ top: 0, left: 0 });
  const [pickingCustom, setPickingCustom] = useState<'start' | 'end' | null>(null);
  const pillRef = useRef<View>(null);

  const openPopover = () => {
    pillRef.current?.measureInWindow((x, y, _w, height) => {
      setPopoverPos({ top: y + height + 8, left: x });
      setPopoverOpen(true);
    });
  };

  const { start, end } = useMemo(() => {
    if (rangeMode === 'preset') {
      const preset = PRESETS.find((p) => p.key === presetKey)!;
      const s = preset.days ? daysAgoStr(preset.days - 1) : monthsAgoStr(preset.months!);
      return { start: s, end: todayStr() };
    }
    if (rangeMode === 'month') {
      const s = `${currentYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, selectedMonth + 1, 0).getDate();
      const e = `${currentYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start: s, end: e };
    }
    return { start: customStart, end: customEnd };
  }, [rangeMode, presetKey, selectedMonth, currentYear, customStart, customEnd]);

  const filtered = useMemo(
    () => expenses.filter((e) => e.date >= start && e.date <= end),
    [expenses, start, end]
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const pillLabel = rangeMode === 'preset'
    ? PRESETS.find((p) => p.key === presetKey)!.shortLabel
    : rangeMode === 'month'
      ? `${MONTH_NAMES[selectedMonth]} ${currentYear}`
      : start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;

  const groups: CategoryGroup[] = useMemo(() => {
    const map: Record<string, CategoryGroup> = {};
    filtered.forEach((e) => {
      const g = (map[e.category] ??= { catId: e.category, amount: 0, items: [] });
      g.amount += e.amount;
      g.items.push(e);
    });
    return Object.values(map)
      .map((g) => ({ ...g, items: [...g.items].sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  return (
    <View>
      <View style={styles.topbar}>
        <Text style={styles.title}>Summary</Text>
      </View>

      <View style={styles.pillRow}>
        <Pressable ref={pillRef} style={styles.pill} onPress={openPopover}>
          <MaterialCommunityIcons name="calendar-range" size={15} color={Colors.primary} />
          <Text style={styles.pillText}>{pillLabel}</Text>
          <MaterialCommunityIcons name="chevron-down" size={15} color={Colors.primary} />
        </Pressable>
      </View>

      <WebPanel
        title={pillLabel}
        linkLabel={total !== 0 ? formatSignedAmount(total) : undefined}>
        {groups.length === 0 ? (
          <Text style={styles.emptyText}>No expenses in this range.</Text>
        ) : (
          <>
            <View style={styles.chartRow}>
              <WebDonutChart
                data={groups.map((g) => ({ id: g.catId, color: getCategoryById(g.catId).color, value: g.amount }))}
                total={total}
                centerLabel="Total"
                centerValue={`$${total.toFixed(0)}`}
              />
              <View style={styles.legend}>
                {groups.map((g) => {
                  const cat = getCategoryById(g.catId);
                  const pct = (g.amount / total) * 100;
                  return (
                    <View key={g.catId} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                      <Text style={styles.legendLabel} numberOfLines={1}>{cat.label}</Text>
                      <Text style={styles.legendPct}>{pct.toFixed(0)}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.cardGrid}>
              {groups.map((g) => {
                const cat = getCategoryById(g.catId);
                return (
                  <View key={g.catId} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={[styles.cardIcon, { backgroundColor: cat.color + '20' }]}>
                        <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
                      </View>
                      <Text style={styles.cardName} numberOfLines={1}>{cat.label}</Text>
                      <Text style={[styles.cardTotal, { color: cat.color }]}>${g.amount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.cardDivider} />
                    <ScrollView style={styles.cardList} showsVerticalScrollIndicator={false}>
                      {g.items.map((item) => (
                        <View key={item.id} style={styles.cardRow}>
                          <Text style={styles.cardRowName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.cardRowAmt}>${item.amount.toFixed(2)}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </WebPanel>

      {/* Floating popover — react-native Modal so it overlays the page
          (doesn't push layout), positioned under the pill via measureInWindow. */}
      <Modal transparent visible={popoverOpen} animationType="fade" onRequestClose={() => setPopoverOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPopoverOpen(false)}>
          <Pressable style={[styles.popover, { top: popoverPos.top, left: popoverPos.left }]} onPress={() => {}}>
            <Text style={styles.popSectionLabel}>Quick range</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => {
                const selected = rangeMode === 'preset' && presetKey === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.presetChip, selected && styles.presetChipSelected]}
                    onPress={() => { setRangeMode('preset'); setPresetKey(p.key); setPopoverOpen(false); }}>
                    <Text style={[styles.presetChipText, selected && styles.presetChipTextSelected]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.popSectionLabel}>Or pick a month</Text>
            <View style={styles.monthGrid}>
              {MONTH_ABBR.map((label, m) => {
                const selected = rangeMode === 'month' && selectedMonth === m;
                return (
                  <Pressable
                    key={label}
                    style={[styles.monthChip, selected && styles.monthChipSelected]}
                    onPress={() => { setRangeMode('month'); setSelectedMonth(m); setPopoverOpen(false); }}>
                    <Text style={[styles.monthChipText, selected && styles.monthChipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.popSectionLabel}>Or a custom range</Text>
            <View style={styles.customRow}>
              <Pressable style={styles.dateInput} onPress={() => setPickingCustom('start')}>
                <Text style={styles.dateInputText}>{formatShort(rangeMode === 'custom' ? customStart : daysAgoStr(29))}</Text>
              </Pressable>
              <MaterialCommunityIcons name="arrow-right" size={15} color={Colors.outline} />
              <Pressable style={styles.dateInput} onPress={() => setPickingCustom('end')}>
                <Text style={styles.dateInputText}>{formatShort(rangeMode === 'custom' ? customEnd : todayStr())}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <WebDatePickerModal
        visible={pickingCustom === 'start'}
        date={customStart}
        maxDate={customEnd}
        onSelect={(d) => { setCustomStart(d); setRangeMode('custom'); setPickingCustom(null); }}
        onClose={() => setPickingCustom(null)}
      />
      <WebDatePickerModal
        visible={pickingCustom === 'end'}
        date={customEnd}
        maxDate={todayStr()}
        onSelect={(d) => { setCustomEnd(d); setRangeMode('custom'); setPickingCustom(null); setPopoverOpen(false); }}
        onClose={() => setPickingCustom(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { marginBottom: 16 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },

  pillRow: { marginBottom: 20 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.primary + '60',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  pillText: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 13 },

  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 24, backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 18, marginBottom: 16 },
  legend: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '31%' },
  legendDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendLabel: { flex: 1, color: Colors.textSecondary, fontSize: 13.5 },
  legendPct: { color: Colors.outline, fontSize: 12.5, fontWeight: '700' },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    width: '31%',
    height: 220,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 },
  cardIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardName: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' },
  cardTotal: { fontSize: 13.5, fontWeight: '800' },
  cardDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 9 },
  cardList: { flex: 1 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 8 },
  cardRowName: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  cardRowAmt: { color: Colors.outline, fontSize: 12.5, fontWeight: '600' },

  backdrop: { flex: 1 },
  popover: {
    position: 'absolute',
    width: 480,
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
