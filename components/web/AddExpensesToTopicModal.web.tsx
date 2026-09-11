// The "Add Expenses" picker, rendered inside WebModal. Search + filter
// chips + a day-grouped checklist. Diffs against the topic's CURRENT
// membership on save rather than a blind full-replace — unchanged rows are
// never touched.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import WebModal from '@/components/web/WebModal.web';
import { Colors, getCategoryById } from '@/constants/theme';
import { formatSignedAmount } from '@/lib/money';
import { expensesForTopic, topicCountForExpense } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import type { Expense } from '@/store/useExpenses';

interface Props {
  topicId: string;
  topicName: string;
  dateStart: string | null;
  dateEnd: string | null;
  visible: boolean;
  onClose: () => void;
}

type FilterKey = 'all' | 'dateRange' | 'unassigned';

export default function AddExpensesToTopicModal({ topicId, topicName, dateStart, dateEnd, visible, onClose }: Props) {
  const { expenses } = useExpenseContext();
  const { memberships, addExpensesToTopic, removeExpenseFromTopic } = useTopicExpensesContext();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentIds = useMemo(
    () => new Set(expensesForTopic(topicId, memberships, expenses).map((e) => e.id)),
    [topicId, memberships, expenses],
  );

  // Seed the selection from current membership exactly once per open —
  // not on every membership change, or a save-in-flight would reset the
  // user's in-progress toggles.
  if (visible && !seeded) {
    setSelected(new Set(currentIds));
    setSeeded(true);
  }
  if (!visible && seeded) {
    setSeeded(false);
  }

  const filtered = useMemo(() => {
    let result = expenses;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (filter === 'dateRange' && dateStart && dateEnd) {
      result = result.filter((e) => e.date >= dateStart && e.date <= dateEnd);
    }
    if (filter === 'unassigned') {
      result = result.filter((e) => topicCountForExpense(e.id, memberships) === 0);
    }
    return result;
  }, [expenses, search, filter, dateStart, dateEnd, memberships]);

  const grouped = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    filtered.forEach((e) => { (map[e.date] ??= []).push(e); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedList = [...selected];
  const selectedTotal = expenses.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amount, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toAdd = selectedList.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !selected.has(id));
      if (toAdd.length > 0) await addExpensesToTopic(topicId, toAdd);
      for (const id of toRemove) await removeExpenseFromTopic(topicId, id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <WebModal
      visible={visible}
      onClose={onClose}
      title={`Add expenses to "${topicName}"`}
      subtitle="Search or scroll your expenses and check the ones that belong here"
      width={560}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name..."
          placeholderTextColor={Colors.outline}
          selectionColor={Colors.primary}
        />
      </View>

      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, filter === 'all' && styles.chipActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>All</Text>
        </Pressable>
        {dateStart && dateEnd && (
          <Pressable style={[styles.chip, filter === 'dateRange' && styles.chipActive]} onPress={() => setFilter('dateRange')}>
            <Text style={[styles.chipText, filter === 'dateRange' && styles.chipTextActive]}>{dateStart} – {dateEnd}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.chip, filter === 'unassigned' && styles.chipActive]} onPress={() => setFilter('unassigned')}>
          <Text style={[styles.chipText, filter === 'unassigned' && styles.chipTextActive]}>Not yet in a topic</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list}>
        {grouped.map(([date, items]) => (
          <View key={date}>
            <Text style={styles.dayLabel}>{date}</Text>
            {items.map((e) => {
              const cat = getCategoryById(e.category);
              const isChecked = selected.has(e.id);
              const otherTopicCount = topicCountForExpense(e.id, memberships, topicId);
              return (
                <Pressable key={e.id} style={[styles.row, isChecked && styles.rowChecked]} onPress={() => toggle(e.id)}>
                  <View style={[styles.cb, isChecked && styles.cbOn]}>
                    {isChecked && <MaterialCommunityIcons name="check" size={11} color={Colors.onPrimary} />}
                  </View>
                  <View style={[styles.rowIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={14} color={cat.color} />
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {e.name}
                      {otherTopicCount > 0 ? ` · in ${otherTopicCount} topic${otherTopicCount !== 1 ? 's' : ''}` : ''}
                    </Text>
                    <Text style={styles.rowMeta}>{cat.label}</Text>
                  </View>
                  <Text style={styles.rowAmt}>{formatSignedAmount(e.amount)}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        {filtered.length === 0 && <Text style={styles.emptyText}>No expenses match.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerCount}>
          <Text style={styles.footerCountBold}>{selectedList.length}</Text> selected · {formatSignedAmount(selectedTotal)}
        </Text>
        <View style={styles.footerActions}>
          <Pressable style={styles.btnGhost} onPress={onClose}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={handleSave} disabled={saving}>
            <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : `Add ${selectedList.length} Expense${selectedList.length !== 1 ? 's' : ''}`}</Text>
          </Pressable>
        </View>
      </View>
    </WebModal>
  );
}

const styles = StyleSheet.create({
  searchRow: { paddingHorizontal: 22, paddingVertical: 14 },
  searchInput: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, fontSize: 13 },

  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingBottom: 10 },
  chip: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5 },
  chipActive: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary + '55' },
  chipText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },
  chipTextActive: { color: Colors.primary },

  list: { maxHeight: 320, paddingHorizontal: 12 },
  dayLabel: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11 },
  rowChecked: { backgroundColor: Colors.primaryMuted },
  cb: { width: 17, height: 17, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cbOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  rowMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  rowAmt: { color: Colors.text, fontSize: 13, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 12.5, padding: 20, textAlign: 'center' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  footerCount: { color: Colors.textSecondary, fontSize: 12.5 },
  footerCountBold: { color: Colors.primary, fontWeight: '800' },
  footerActions: { flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 9 },
  btnGhostText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  btnPrimary: { backgroundColor: Colors.primary, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 },
  btnPrimaryText: { color: Colors.onPrimary, fontSize: 12.5, fontWeight: '800' },
});
