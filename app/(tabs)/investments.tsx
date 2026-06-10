import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddInvestmentSheet from '@/components/AddInvestmentSheet';
import { Colors } from '@/constants/theme';
import { useInvestmentsContext } from '@/store/InvestmentsContext';
import { Investment, InvestmentType } from '@/store/useInvestments';

// ── Design tokens ──────────────────────────────────────
const ACCENT       = '#B39DDB';
const ACCENT_MUTED = '#B39DDB22';
const ON_ACCENT    = '#1A0050';

const TYPE_META: Record<InvestmentType, { label: string; color: string; gradEnd: string; icon: string }> = {
  '401k':         { label: '401k',         color: '#60A5FA', gradEnd: '#3B82F6', icon: 'bank-outline' },
  'stocks':       { label: 'Stocks',       color: '#34D399', gradEnd: '#10B981', icon: 'trending-up' },
  'mutual_funds': { label: 'Mutual Funds', color: '#A78BFA', gradEnd: '#7C3AED', icon: 'chart-pie' },
};

const FREQ_LABEL: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly',
};

// ── Donut chart ────────────────────────────────────────
const CHART_SIZE = 220;
const CX = CHART_SIZE / 2;
const CY = CHART_SIZE / 2;
const OUTER_R = 88;
const INNER_R  = 58;
const GAP_DEG  = 3.5;
const BG_R     = (OUTER_R + INNER_R) / 2;
const BG_STROKE = OUTER_R - INNER_R;

function toRad(deg: number) { return ((deg - 90) * Math.PI) / 180; }
function pt(r: number, deg: number) {
  return { x: CX + r * Math.cos(toRad(deg)), y: CY + r * Math.sin(toRad(deg)) };
}
function arcPath(startDeg: number, endDeg: number): string {
  const o1 = pt(OUTER_R, startDeg), o2 = pt(OUTER_R, endDeg);
  const i2 = pt(INNER_R, endDeg),  i1 = pt(INNER_R, startDeg);
  const la = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M${o1.x.toFixed(2)},${o1.y.toFixed(2)}`,
    `A${OUTER_R},${OUTER_R},0,${la},1,${o2.x.toFixed(2)},${o2.y.toFixed(2)}`,
    `L${i2.x.toFixed(2)},${i2.y.toFixed(2)}`,
    `A${INNER_R},${INNER_R},0,${la},0,${i1.x.toFixed(2)},${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Segment { type: InvestmentType; value: number; color: string; gradEnd: string }

function DonutChart({ segments, total }: { segments: Segment[]; total: number }) {
  const visible = segments.filter((s) => s.value > 0);

  return (
    <View style={chartStyles.wrap}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        <Defs>
          {/* Background ring gradient */}
          <LinearGradient id="bgRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2E2C3B" stopOpacity="1" />
            <Stop offset="1" stopColor="#1C1B23" stopOpacity="1" />
          </LinearGradient>
          {/* Per-segment gradients */}
          {visible.map((s) => (
            <LinearGradient key={`g_${s.type}`} id={`g_${s.type}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0"   stopColor={s.color}   stopOpacity="1" />
              <Stop offset="1"   stopColor={s.gradEnd} stopOpacity="1" />
            </LinearGradient>
          ))}
        </Defs>

        {/* Background donut ring */}
        <Circle
          cx={CX} cy={CY} r={BG_R}
          fill="none"
          stroke="url(#bgRing)"
          strokeWidth={BG_STROKE + 2}
        />

        {/* Empty state: single muted ring */}
        {visible.length === 0 && (
          <Circle
            cx={CX} cy={CY} r={BG_R}
            fill="none"
            stroke={ACCENT + '30'}
            strokeWidth={BG_STROKE - 2}
          />
        )}

        {/* Segments */}
        {(() => {
          const gapDeg = visible.length > 1 ? GAP_DEG : 0;
          const avail  = 360 - gapDeg * visible.length;
          let angle    = 0;
          return visible.map((s) => {
            const segDeg = (s.value / total) * avail;
            const start  = angle;
            const end    = angle + segDeg;
            angle        = end + gapDeg;
            return (
              <Path
                key={s.type}
                d={arcPath(start, end)}
                fill={`url(#g_${s.type})`}
              />
            );
          });
        })()}

        {/* Center label */}
        <SvgText
          x={CX} y={CY - 10}
          textAnchor="middle"
          fill="#E6E1E5"
          fontSize={total >= 10000 ? 20 : 24}
          fontWeight="800"
          letterSpacing="-0.5">
          {formatCompact(total)}
        </SvgText>
        <SvgText
          x={CX} y={CY + 12}
          textAnchor="middle"
          fill="#938F99"
          fontSize={11}
          fontWeight="600">
          TOTAL INVESTED
        </SvgText>
      </Svg>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});

// ── Legend row ─────────────────────────────────────────
function LegendRow({ seg, total }: { seg: Segment; total: number }) {
  const pct  = total > 0 ? ((seg.value / total) * 100).toFixed(1) : '0.0';
  const meta = TYPE_META[seg.type];
  return (
    <View style={legendStyles.row}>
      <View style={[legendStyles.dot, { backgroundColor: meta.color }]} />
      <Text style={legendStyles.label}>{meta.label}</Text>
      <View style={legendStyles.bar}>
        <View style={[legendStyles.barFill, { width: `${pct}%` as any, backgroundColor: meta.color + '55' }]} />
      </View>
      <Text style={legendStyles.pct}>{pct}%</Text>
      <Text style={legendStyles.amount}>${seg.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: '#CAC4D0', fontSize: 13, fontWeight: '600', width: 88 },
  bar: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: '#2E2C3B', overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  pct:    { color: '#938F99', fontSize: 12, width: 38, textAlign: 'right' },
  amount: { color: '#E6E1E5', fontSize: 13, fontWeight: '700', width: 68, textAlign: 'right' },
});

// ── Investment row ─────────────────────────────────────
function InvestmentRow({ item, onDelete }: { item: Investment; onDelete: () => void }) {
  const meta = TYPE_META[item.type];
  const displayDate = new Date(item.date + 'T00:00:00').toLocaleDateString('default', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={rowStyles.card}>
      <View style={[rowStyles.iconWrap, { backgroundColor: meta.color + '20' }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
      </View>

      <View style={rowStyles.body}>
        <View style={rowStyles.nameRow}>
          <Text style={rowStyles.name} numberOfLines={1}>{item.name}</Text>
          {item.isRecurring && (
            <View style={rowStyles.recurBadge}>
              <MaterialCommunityIcons name="repeat" size={10} color={ACCENT} />
              <Text style={rowStyles.recurText}>
                {item.recurringFrequency ? FREQ_LABEL[item.recurringFrequency] : 'Recurring'}
              </Text>
            </View>
          )}
        </View>
        {item.note ? <Text style={rowStyles.note} numberOfLines={1}>{item.note}</Text> : null}
        <Text style={rowStyles.date}>{displayDate}</Text>
      </View>

      <View style={rowStyles.right}>
        <Text style={[rowStyles.amount, { color: meta.color }]}>
          +${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Pressable onPress={onDelete} hitSlop={10} style={rowStyles.deleteBtn}>
          <MaterialCommunityIcons name="trash-can-outline" size={15} color={Colors.outline} />
        </Pressable>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  iconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { color: Colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  recurBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: ACCENT_MUTED,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  recurText: { color: ACCENT, fontSize: 10, fontWeight: '700' },
  note: { color: Colors.textSecondary, fontSize: 12 },
  date: { color: Colors.textMuted, fontSize: 11 },
  right: { alignItems: 'flex-end', gap: 8 },
  amount: { fontSize: 15, fontWeight: '700' },
  deleteBtn: { padding: 2 },
});

// ── Main screen ────────────────────────────────────────
export default function InvestmentsScreen() {
  const sheetRef = useRef<BottomSheet>(null);
  const { investments, deleteInvestment, totalInvested, totalByType, refresh } =
    useInvestmentsContext();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const total    = totalInvested();
  const byType   = totalByType();

  const segments: Segment[] = (Object.keys(TYPE_META) as InvestmentType[]).map((t) => ({
    type:    t,
    value:   byType[t] ?? 0,
    color:   TYPE_META[t].color,
    gradEnd: TYPE_META[t].gradEnd,
  }));

  const handleDelete = (id: string) => {
    Alert.alert('Delete Investment?', 'This entry will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteInvestment(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={investments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />
        }
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Investments</Text>
                <Text style={styles.subtitle}>Your portfolio at a glance</Text>
              </View>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="chart-line-variant" size={22} color={ACCENT} />
              </View>
            </View>

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <DonutChart segments={segments} total={total} />

              {/* Legend */}
              <View style={styles.legendWrap}>
                {segments.map((s) => (
                  <LegendRow key={s.type} seg={s} total={total} />
                ))}
              </View>
            </View>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>History</Text>
              <Text style={styles.sectionCount}>{investments.length}</Text>
            </View>

            {investments.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={56} color={Colors.outline} />
                <Text style={styles.emptyText}>No investments yet</Text>
                <Text style={styles.emptySubText}>
                  Tap + to log your 401k,{'\n'}stocks or mutual funds
                </Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <InvestmentRow item={item} onDelete={() => handleDelete(item.id)} />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => sheetRef.current?.expand()}
        activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={ON_ACCENT} />
      </TouchableOpacity>

      <AddInvestmentSheet sheetRef={sheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingHorizontal: 18, paddingBottom: 100 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 16, paddingBottom: 14,
  },
  title:    { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: ACCENT_MUTED,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 28, paddingVertical: 24, paddingHorizontal: 20,
    marginBottom: 24, borderWidth: 1, borderColor: Colors.border,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },

  legendWrap: { marginTop: 20 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sectionCount: {
    backgroundColor: Colors.surfaceContainer,
    color: Colors.textSecondary, fontSize: 12, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText:    { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySubText: {
    color: Colors.textSecondary, fontSize: 14,
    textAlign: 'center', lineHeight: 20,
  },

  fab: {
    position: 'absolute', bottom: 82, right: 22,
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
  },
});
