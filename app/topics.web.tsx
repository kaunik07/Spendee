// Web-only Topics list page. Bare content — WebLayout already wraps every
// route once in AuthGuard (app/_layout.tsx), same convention
// import-statement.web.tsx already follows.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import NewTopicDrawer from '@/components/web/NewTopicDrawer.web';
import TopicCard from '@/components/web/TopicCard.web';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { expensesForTopic, topicTotal } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import { useTopicsContext } from '@/store/TopicsContext';

export default function TopicsScreenWeb() {
  const { topics } = useTopicsContext();
  const { memberships } = useTopicExpensesContext();
  const { expenses } = useExpenseContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const withTotals = useMemo(
    () => topics.map((t) => {
      const tExpenses = expensesForTopic(t.id, memberships, expenses);
      return { topic: t, total: topicTotal(tExpenses), count: tExpenses.length };
    }),
    [topics, memberships, expenses],
  );

  const active = withTotals.filter((x) => !x.topic.archived);
  const archived = withTotals.filter((x) => x.topic.archived);
  const trackedThisYear = active.reduce((s, x) => s + x.total, 0);

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Topics</Text>
          <Text style={styles.sub}>Group expenses by trip, project or event to see what they really cost</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setDrawerOpen(true)}>
          <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>New Topic</Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <WebStatCard label="Active Topics" value={`${active.length}`} />
        <WebStatCard label="Tracked This Year" value={`$${trackedThisYear.toFixed(2)}`} />
        <WebStatCard label="Archived" value={`${archived.length}`} />
      </View>

      {topics.length === 0 ? (
        <Text style={styles.emptyText}>No topics yet — create one to group expenses across categories.</Text>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Active</Text>
              <View style={styles.grid}>
                {active.map(({ topic, total, count }) => (
                  <TopicCard key={topic.id} topic={topic} total={total} expenseCount={count} />
                ))}
              </View>
            </>
          )}
          {archived.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Archived</Text>
              <View style={styles.grid}>
                {archived.map(({ topic, total, count }) => (
                  <TopicCard key={topic.id} topic={topic} total={total} expenseCount={count} />
                ))}
              </View>
            </>
          )}
        </>
      )}

      <NewTopicDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.textSecondary, fontSize: 13, marginTop: 3, maxWidth: 420 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 13.5 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },

  emptyText: { color: Colors.outline, fontSize: 13 },

  sectionLabel: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.06, marginTop: 8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
