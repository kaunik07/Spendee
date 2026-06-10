import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useInvestmentsContext } from '@/store/InvestmentsContext';
import { InvestmentType, RecurringFrequency } from '@/store/useInvestments';

const ACCENT   = '#B39DDB';
const ON_ACCENT = '#1A0050';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  high:    '#2E2C3B',
  primary: ACCENT,
  onPrim:  ON_ACCENT,
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border:  '#2E2C3B',
  danger:  '#F2B8B5',
};

const TYPE_META: Record<InvestmentType, { label: string; color: string; icon: string }> = {
  '401k':         { label: '401k',         color: '#60A5FA', icon: 'bank-outline' },
  'stocks':       { label: 'Stocks',       color: '#34D399', icon: 'trending-up' },
  'mutual_funds': { label: 'Mutual Funds', color: '#A78BFA', icon: 'chart-pie' },
};

const FREQ_META: Record<RecurringFrequency, string> = {
  weekly:   'Weekly',
  biweekly: 'Bi-weekly',
  monthly:  'Monthly',
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function computeNextDueDate(fromDate: string, freq: RecurringFrequency): string {
  const d = new Date(fromDate + 'T00:00:00');
  if (freq === 'weekly')        d.setDate(d.getDate() + 7);
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
  else                          d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddInvestmentSheet({ sheetRef }: Props) {
  const { addInvestment } = useInvestmentsContext();
  const snapPoints        = useMemo(() => ['85%'], []);
  const keyboardHeight    = useKeyboardHeight();

  const [amount,    setAmount]    = useState('');
  const [name,      setName]      = useState('');
  const [note,      setNote]      = useState('');
  const [type,      setType]      = useState<InvestmentType>('stocks');
  const [date,      setDate]      = useState(todayStr());
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [showDate,  setShowDate]  = useState(false);

  const dateObj = new Date(date + 'T00:00:00');

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ), []
  );

  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    await addInvestment({
      name:               name.trim(),
      type,
      amount:             parseFloat(amount),
      date,
      note:               note.trim(),
      isRecurring:        recurring,
      recurringFrequency: recurring ? frequency : null,
      nextDueDate:        recurring ? computeNextDueDate(date, frequency) : null,
    });
    // reset
    setAmount(''); setName(''); setNote('');
    setType('stocks'); setDate(todayStr());
    setRecurring(false); setFrequency('monthly');
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: C.bg }}
      handleIndicatorStyle={{ backgroundColor: C.outline }}>
      <BottomSheetScrollView
        contentContainerStyle={[styles.container, { paddingBottom: keyboardHeight || 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title}>Add Investment</Text>

        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={C.outline}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
            selectionColor={C.primary}
          />
        </View>

        {/* Name */}
        <Text style={styles.label}>Investment Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Vanguard S&P 500, Apple Stock..."
          placeholderTextColor={C.outline}
          value={name}
          onChangeText={setName}
          maxLength={60}
          returnKeyType="next"
          selectionColor={C.primary}
        />

        {/* Type */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.pillRow}>
          {(Object.keys(TYPE_META) as InvestmentType[]).map((t) => {
            const meta    = TYPE_META[t];
            const active  = type === t;
            return (
              <TouchableOpacity
                key={t}
                style={[
                  styles.pill,
                  active && { backgroundColor: meta.color + '22', borderColor: meta.color },
                ]}
                onPress={() => setType(t)}
                activeOpacity={0.75}>
                <MaterialCommunityIcons
                  name={meta.icon as any}
                  size={15}
                  color={active ? meta.color : C.outline}
                />
                <Text style={[styles.pillText, active && { color: meta.color }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <Pressable
          style={styles.dateRow}
          onPress={() => { Keyboard.dismiss(); setShowDate(true); }}>
          <MaterialCommunityIcons name="calendar-outline" size={16} color={C.primary} />
          <Text style={styles.dateText}>
            {dateObj.toLocaleDateString('default', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          <MaterialCommunityIcons name="pencil-outline" size={14} color={C.outline} style={{ marginLeft: 'auto' }} />
        </Pressable>

        {showDate && Platform.OS === 'android' && (
          <DateTimePicker
            value={dateObj}
            mode="date"
            display="default"
            onChange={(_, selected) => {
              setShowDate(false);
              if (selected) setDate(selected.toISOString().split('T')[0]);
            }}
          />
        )}
        {showDate && Platform.OS === 'ios' && (
          <Modal transparent animationType="fade" onRequestClose={() => setShowDate(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setShowDate(false)}>
              <Pressable style={styles.dateCard} onPress={() => {}}>
                <DateTimePicker
                  value={dateObj}
                  mode="date"
                  display="spinner"
                  textColor={C.text}
                  onChange={(_, selected) => { if (selected) setDate(selected.toISOString().split('T')[0]); }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity style={styles.dateDone} onPress={() => setShowDate(false)}>
                  <Text style={styles.dateDoneText}>Done</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* Note */}
        <Text style={styles.label}>
          Note <Text style={styles.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="e.g. Monthly contribution, dividend reinvestment..."
          placeholderTextColor={C.outline}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={200}
          selectionColor={C.primary}
        />

        {/* Recurring toggle */}
        <View style={styles.recurringRow}>
          <View style={styles.recurringLeft}>
            <MaterialCommunityIcons name="repeat" size={18} color={recurring ? C.primary : C.outline} />
            <View>
              <Text style={[styles.recurringTitle, recurring && { color: C.primary }]}>
                Recurring
              </Text>
              <Text style={styles.recurringSubtitle}>
                Auto-add on a schedule
              </Text>
            </View>
          </View>
          <Switch
            value={recurring}
            onValueChange={setRecurring}
            trackColor={{ false: C.high, true: C.primary + '66' }}
            thumbColor={recurring ? C.primary : C.outline}
          />
        </View>

        {/* Frequency picker (visible when recurring) */}
        {recurring && (
          <View style={styles.freqSection}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.pillRow}>
              {(Object.keys(FREQ_META) as RecurringFrequency[]).map((f) => {
                const active = frequency === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.pill, active && { backgroundColor: C.primary + '22', borderColor: C.primary }]}
                    onPress={() => setFrequency(f)}
                    activeOpacity={0.75}>
                    <Text style={[styles.pillText, active && { color: C.primary }]}>
                      {FREQ_META[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.recurringHint}>
              <MaterialCommunityIcons name="information-outline" size={13} color={C.outline} />
              <Text style={styles.hintText}>
                Next auto-add: {new Date(computeNextDueDate(date, frequency) + 'T00:00:00')
                  .toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!canSave}>
          <MaterialCommunityIcons name="check" size={20} color={ON_ACCENT} />
          <Text style={styles.saveBtnText}>Save Investment</Text>
        </TouchableOpacity>

      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22, paddingTop: 4 },

  title: {
    color: C.text, fontSize: 20, fontWeight: '700',
    textAlign: 'center', marginBottom: 24, letterSpacing: 0.2,
  },

  amountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 20,
    paddingVertical: 18, paddingHorizontal: 24,
    marginBottom: 24, borderWidth: 1, borderColor: C.border, gap: 6,
  },
  currencySymbol: { color: C.primary, fontSize: 32, fontWeight: '700' },
  amountInput: {
    color: C.text, fontSize: 48, fontWeight: '800', letterSpacing: -1,
    minWidth: 100, textAlign: 'center',
  },

  label: {
    color: C.textSec, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },

  input: {
    backgroundColor: C.surface, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    color: C.text, fontSize: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 18,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },

  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  pillText: { color: C.outline, fontSize: 13, fontWeight: '600' },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 18,
  },
  dateText: { color: C.primary, fontSize: 15, fontWeight: '600', flex: 1 },

  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  dateCard: {
    backgroundColor: C.bg, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, paddingBottom: 34, paddingTop: 12,
  },
  dateDone: {
    marginHorizontal: 22, marginTop: 8,
    backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  dateDoneText: { color: ON_ACCENT, fontSize: 16, fontWeight: '700' },

  recurringRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 18,
  },
  recurringLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recurringTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  recurringSubtitle: { color: C.outline, fontSize: 12, marginTop: 1 },

  freqSection: { marginBottom: 4 },
  recurringHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: -10, marginBottom: 18,
  },
  hintText: { color: C.outline, fontSize: 12 },

  saveBtn: {
    backgroundColor: C.primary, borderRadius: 16,
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: ON_ACCENT, fontSize: 17, fontWeight: '700' },
});
