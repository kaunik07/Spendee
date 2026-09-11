// Web-only Topic detail page. Follows app/account/[id].web.tsx's exact
// shape: useLocalSearchParams for the id, WebStatCard/WebPanel-style cards
// for the summary, a drawer for edit.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AddExpensesToTopicModal from '@/components/web/AddExpensesToTopicModal.web';
import EditTopicDrawer from '@/components/web/EditTopicDrawer.web';
import WebDonutChart from '@/components/web/WebDonutChart';
import { Colors, getCategoryById } from '@/constants/theme';
import { formatSignedAmount, signedAmountColor } from '@/lib/money';
import { categoryBreakdown, expensesForTopic, topicTotal } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import { useTopicsContext } from '@/store/TopicsContext';

const WARN_COLOR = '#FFB74D';

export default function TopicDetailScreenWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { topics, updateTopic } = useTopicsContext();
  const { memberships, removeExpenseFromTopic } = useTopicExpensesContext();
  const { expenses } = useExpenseContext();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const topic = topics.find((t) => t.id === id);

  const topicExpenses = useMemo(
    () => (topic ? expensesForTopic(topic.id, memberships, expenses) : []),
    [topic, memberships, expenses],
  );
  const total = useMemo(() => topicTotal(topicExpenses), [topicExpenses]);
  const breakdown = useMemo(() => categoryBreakdown(topicExpenses), [topicExpenses]);

  const filteredExpenses = categoryFilter
    ? topicExpenses.filter((e) => e.category === categoryFilter)
    : topicExpenses;

  if (!topic) return null;

  const pct = topic.targetAmount && topic.targetAmount > 0 ? (total / topic.targetAmount) * 100 : null;
  const remaining = topic.targetAmount !== null ? topic.targetAmount - total : null;

  const metaParts: string[] = [];
  if (topic.dateStart && topic.dateEnd) metaParts.push(`${topic.dateStart} – ${topic.dateEnd}`);
  else if (topic.dateStart) metaParts.push(`Started ${topic.dateStart}`);
  metaParts.push(`${topicExpenses.length} expense${topicExpenses.length !== 1 ? 's' : ''}`);

  const handleRemove = (expenseId: string, name: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove "${name}" from this topic? The expense itself won't be deleted.`)) return;
    removeExpenseFromTopic(topic.id, expenseId);
  };

  const handleArchiveToggle = () => updateTopic(topic.id, { archived: !topic.archived });

  const donutData = breakdown.map((b) => ({ id: b.catId, color: getCategoryById(b.catId).color, value: Math.abs(b.amount) }));
  const donutTotal = breakdown.reduce((s, b) => s + Math.abs(b.amount), 0);

  return (
    <View>
      <Pressable onPress={() => router.push('/topics')}>
        <Text style={styles.crumb}>Topics / <Text style={styles.crumbBold}>{topic.name}</Text></Text>
      </Pressable>

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}><Text style={styles.headerIconText}>{topic.icon}</Text></View>
          <View>
            <Text style={styles.headerName}>{topic.name}</Text>
            <Text style={styles.headerMeta}>{metaParts.join(' · ')}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.btnGhost} onPress={() => setEditDrawerOpen(true)}>
            <Text style={styles.btnGhostText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={handleArchiveToggle}>
            <Text style={styles.btnGhostText}>{topic.archived ? 'Unarchive' : 'Archive'}</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={() => setAddModalOpen(true)}>
            <MaterialCommunityIcons name="plus" size={15} color={Colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>Add Expenses</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.totalCard}>
          <Text style={styles.cardLabel}>Total Spent</Text>
          <Text style={[styles.totalValue, { color: signedAmountColor(total) }]}>{formatSignedAmount(total)}</Text>
          <Text style={styles.totalSub}>across {topicExpenses.length} expense{topicExpenses.length !== 1 ? 's' : ''}</Text>
          {pct !== null && (
            <>
              <View style={styles.targetTrack}>
                <View style={[styles.targetFill, { width: `${Math.min(100, Math.max(0, pct))}%` as any, backgroundColor: pct >= 100 ? Colors.danger : pct >= 90 ? WARN_COLOR : Colors.primary }]} />
              </View>
              <View style={styles.targetCaptionRow}>
                <Text style={styles.targetCaption}>{pct.toFixed(0)}% of ${topic.targetAmount!.toFixed(2)} target</Text>
                <Text style={[styles.targetCaption, { color: remaining! >= 0 ? Colors.textMuted : Colors.danger }]}>
                  {remaining! >= 0 ? `$${remaining!.toFixed(2)} left` : `$${Math.abs(remaining!).toFixed(2)} over`}
                </Text>
              </View>
            </>
          )}
        </View>

        {topicExpenses.length > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.cardLabel}>Breakdown by Category</Text>
            <View style={styles.donutRow}>
              <WebDonutChart data={donutData} total={donutTotal} size={104} strokeWidth={18} centerLabel="items" centerValue={`${topicExpenses.length}`} />
              <View style={styles.legend}>
                {breakdown.map((b) => {
                  const cat = getCategoryById(b.catId);
                  return (
                    <View key={b.catId} style={styles.legendRow}>
                      <View style={styles.legendLeft}>
                        <View style={[styles.dot, { backgroundColor: cat.color }]} />
                        <Text style={styles.legendLabel}>{cat.label}</Text>
                      </View>
                      <Text style={styles.legendAmt}>{formatSignedAmount(b.amount)} · {Math.abs(b.pct).toFixed(0)}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </View>

      {topicExpenses.length === 0 ? (
        <Text style={styles.emptyText}>No expenses yet — add some to see what this topic costs.</Text>
      ) : (
        <>
          <View style={styles.filterRow}>
            <Pressable style={[styles.filterPill, categoryFilter === null && styles.filterPillActive]} onPress={() => setCategoryFilter(null)}>
              <Text style={[styles.filterPillText, categoryFilter === null && styles.filterPillTextActive]}>All</Text>
            </Pressable>
            {breakdown.map((b) => {
              const cat = getCategoryById(b.catId);
              const active = categoryFilter === b.catId;
              return (
                <Pressable key={b.catId} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setCategoryFilter(active ? null : b.catId)}>
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.expTable}>
            {filteredExpenses.map((e) => {
              const cat = getCategoryById(e.category);
              return (
                <View key={e.id} style={styles.expRow}>
                  <Text style={styles.expDate}>{e.date}</Text>
                  <View style={[styles.expIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={15} color={cat.color} />
                  </View>
                  <View style={styles.expMid}>
                    <Text style={styles.expName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.expCat}>{cat.label}</Text>
                  </View>
                  <Text style={[styles.expAmt, { color: signedAmountColor(e.amount) }]}>{formatSignedAmount(e.amount)}</Text>
                  <Pressable onPress={() => handleRemove(e.id, e.name)} hitSlop={8} style={styles.expRemove}>
                    <MaterialCommunityIcons name="close" size={14} color={Colors.outline} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}

      <EditTopicDrawer topic={topic} visible={editDrawerOpen} onClose={() => setEditDrawerOpen(false)} />
      <AddExpensesToTopicModal
        topicId={topic.id}
        topicName={topic.name}
        dateStart={topic.dateStart}
        dateEnd={topic.dateEnd}
        visible={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  crumb: { color: Colors.outline, fontSize: 12, marginBottom: 14 },
  crumbBold: { color: Colors.textSecondary, fontWeight: '600' },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  headerLeft: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  headerIconText: { fontSize: 24 },
  headerName: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  headerMeta: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  btnGhostText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 9 },
  btnPrimaryText: { color: Colors.onPrimary, fontSize: 12.5, fontWeight: '800' },

  summaryRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },
  totalCard: { flex: 1.3, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 22 },
  breakdownCard: { flex: 1.7, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 22 },
  cardLabel: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 8 },
  totalValue: { fontSize: 32, fontWeight: '800' },
  totalSub: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 6 },
  targetTrack: { height: 7, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  targetFill: { height: '100%', borderRadius: 4 },
  targetCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  targetCaption: { color: Colors.textMuted, fontSize: 11 },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: Colors.textSecondary, fontSize: 12 },
  legendAmt: { color: Colors.text, fontSize: 12, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 13 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterPill: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
  filterPillActive: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary + '55' },
  filterPillText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: Colors.primary },

  expTable: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, overflow: 'hidden' },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
  expDate: { color: Colors.textSecondary, fontSize: 12, width: 80 },
  expIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expMid: { flex: 1, minWidth: 0 },
  expName: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  expCat: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  expAmt: { fontSize: 13.5, fontWeight: '700' },
  expRemove: { width: 24, alignItems: 'flex-end' },
});
