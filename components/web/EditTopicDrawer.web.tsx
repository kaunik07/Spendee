// Edit an existing topic. Sibling to NewTopicDrawer.web.tsx rather than one
// drawer with an isEditing branch — same convention EditExpenseDrawer.tsx
// established for expenses.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import WebDrawer from '@/components/web/WebDrawer';
import { Colors } from '@/constants/theme';
import { useTopicsContext } from '@/store/TopicsContext';
import type { Topic } from '@/store/useTopics';

const QUICK_ICONS = ['🗽', '📦', '🏖️', '💍', '🎓', '🚗', '🏠', '🎉'];

interface Props {
  topic: Topic | null;
  visible: boolean;
  onClose: () => void;
}

export default function EditTopicDrawer({ topic, visible, onClose }: Props) {
  const { updateTopic } = useTopicsContext();

  const [icon, setIcon] = useState('🗂️');
  const [customIconMode, setCustomIconMode] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [dateStart, setDateStart] = useState<string | null>(null);
  const [dateEnd, setDateEnd] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed whenever a different topic is opened — this component stays
  // mounted between openings, so state would otherwise carry over.
  useEffect(() => {
    if (!topic || !visible) return;
    setIcon(topic.icon);
    setCustomIconMode(!QUICK_ICONS.includes(topic.icon));
    setName(topic.name);
    setNote(topic.note);
    setTargetAmount(topic.targetAmount !== null ? topic.targetAmount.toString() : '');
    setDateStart(topic.dateStart);
    setDateEnd(topic.dateEnd);
  }, [topic?.id, visible]);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave || !topic) return;
    setSaving(true);
    try {
      await updateTopic(topic.id, {
        name: name.trim(),
        note: note.trim(),
        icon,
        targetAmount: targetAmount.trim() ? parseFloat(targetAmount) : null,
        dateStart,
        dateEnd,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <WebDrawer visible={visible && !!topic} onClose={onClose} title="Edit Topic">
        <Text style={styles.label}>Icon</Text>
        <View style={styles.iconRow}>
          {QUICK_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconPick, icon === i && !customIconMode && styles.iconPickSelected]}
              onPress={() => { setIcon(i); setCustomIconMode(false); }}>
              <Text style={styles.iconPickText}>{i}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.iconPick, styles.iconPickCustom, customIconMode && styles.iconPickSelected]}
            onPress={() => setCustomIconMode(true)}>
            <Text style={styles.iconPickCustomText}>+</Text>
          </Pressable>
        </View>
        {customIconMode && (
          <TextInput
            style={styles.customIconInput}
            value={QUICK_ICONS.includes(icon) ? '' : icon}
            onChangeText={(t) => setIcon(t || QUICK_ICONS[0])}
            placeholder="Type or paste any emoji"
            placeholderTextColor={Colors.outline}
            maxLength={4}
          />
        )}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={60} selectionColor={Colors.primary} />

        <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={200} selectionColor={Colors.primary} />

        <Text style={styles.label}>Target Budget <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={targetAmount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setTargetAmount(t); }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.outline}
            selectionColor={Colors.primary}
          />
        </View>

        <Text style={styles.label}>Date Range <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('start')}>
            <Text style={dateStart ? styles.dateInputText : styles.dateInputPlaceholder}>{dateStart ?? 'Start date'}</Text>
          </Pressable>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('end')}>
            <Text style={dateEnd ? styles.dateInputText : styles.dateInputPlaceholder}>{dateEnd ?? 'End date'}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>
      </WebDrawer>

      <WebDatePickerModal
        visible={pickingDate === 'start'}
        date={dateStart ?? new Date().toISOString().split('T')[0]}
        maxDate={dateEnd ?? undefined}
        onSelect={(d) => { setDateStart(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
      <WebDatePickerModal
        visible={pickingDate === 'end'}
        date={dateEnd ?? new Date().toISOString().split('T')[0]}
        onSelect={(d) => { setDateEnd(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.05, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPick: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  iconPickSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryMuted },
  iconPickText: { fontSize: 17 },
  iconPickCustom: { borderStyle: 'dashed' },
  iconPickCustomText: { color: Colors.outline, fontSize: 16, fontWeight: '700' },
  customIconInput: {
    marginTop: 8, backgroundColor: Colors.surfaceContainer, borderRadius: 11, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, fontSize: 18,
  },

  input: { backgroundColor: Colors.surfaceContainer, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },

  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14 },
  currencySymbol: { color: Colors.primary, fontSize: 16, fontWeight: '700', marginRight: 4 },
  amountInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 10 },

  dateRow: { flexDirection: 'row', gap: 10 },
  dateInput: { flex: 1, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dateInputText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  dateInputPlaceholder: { color: Colors.outline, fontSize: 13.5 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.onPrimary, fontSize: 14.5, fontWeight: '800' },
});
