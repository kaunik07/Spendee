// One topic card on the /topics list page. Split into its own file since
// topics.web.tsx would otherwise carry both the page shell and every card's
// render logic (~300+ lines combined).
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { formatSignedAmount } from '@/lib/money';
import type { Topic } from '@/store/useTopics';

const WARN_COLOR = '#FFB74D';

interface Props {
  topic: Topic;
  total: number;
  expenseCount: number;
}

function metaLine(topic: Topic): string {
  if (topic.dateStart && topic.dateEnd) {
    return `${formatShort(topic.dateStart)} – ${formatShort(topic.dateEnd)}`;
  }
  if (topic.dateStart) return `Started ${formatShort(topic.dateStart)}`;
  return '';
}

function formatShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}

export default function TopicCard({ topic, total, expenseCount }: Props) {
  const router = useRouter();
  const meta = metaLine(topic);
  const metaWithCount = [meta, `${expenseCount} expense${expenseCount !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');

  const pct = topic.targetAmount && topic.targetAmount > 0 ? (total / topic.targetAmount) * 100 : null;
  const barColor = pct === null ? undefined : pct >= 100 ? Colors.danger : pct >= 90 ? WARN_COLOR : Colors.primary;

  return (
    <Pressable style={[styles.card, topic.archived && styles.cardArchived]} onPress={() => router.push(`/topics/${topic.id}` as any)}>
      <View style={styles.top}>
        <View style={styles.icon}><Text style={styles.iconText}>{topic.icon}</Text></View>
        <View style={[styles.badge, topic.archived ? styles.badgeArchived : styles.badgeActive]}>
          <Text style={[styles.badgeText, topic.archived ? styles.badgeTextArchived : styles.badgeTextActive]}>
            {topic.archived ? 'Archived' : 'Active'}
          </Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{topic.name}</Text>
      <Text style={styles.meta} numberOfLines={1}>{metaWithCount}</Text>
      <View style={styles.amtRow}>
        <Text style={styles.amt}>{formatSignedAmount(total)}</Text>
        <Text style={styles.count}>{topic.targetAmount ? `of $${topic.targetAmount.toFixed(2)}` : 'no target set'}</Text>
      </View>
      {pct !== null && (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={styles.pctLabel}>{pct.toFixed(0)}% of target</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // minWidth/flexBasis/flexGrow, not a fixed width: topics.web.tsx's grid
  // uses flexWrap (react-native-web has no `display: grid`), so each card
  // needs to size itself for that to wrap into columns.
  card: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 18, minWidth: 260, flexBasis: '31%', flexGrow: 1 },
  cardArchived: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeActive: { backgroundColor: Colors.primary + '1A' },
  badgeArchived: { backgroundColor: Colors.surfaceContainerHigh },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.04 },
  badgeTextActive: { color: Colors.primary },
  badgeTextArchived: { color: Colors.outline },
  name: { color: Colors.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  meta: { color: Colors.textMuted, fontSize: 11.5, marginBottom: 14 },
  amtRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amt: { color: Colors.text, fontSize: 19, fontWeight: '800' },
  count: { color: Colors.outline, fontSize: 11.5 },
  track: { height: 5, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  pctLabel: { color: Colors.textMuted, fontSize: 10.5, marginTop: 6 },
});
