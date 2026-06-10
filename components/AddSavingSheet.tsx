import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useSavingsContext } from '@/store/SavingsContext';

const C = {
  bg:       '#1C1B23',
  surface:  '#252336',
  high:     '#2E2C3B',
  primary:  '#FFD666',   // gold — savings feel
  onPrim:   '#3A2E00',
  text:     '#E6E1E5',
  textSec:  '#CAC4D0',
  outline:  '#938F99',
  border:   '#2E2C3B',
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddSavingSheet({ sheetRef }: Props) {
  const { addSaving } = useSavingsContext();
  const snapPoints = useMemo(() => ['70%'], []);
  const keyboardHeight = useKeyboardHeight();

  const [amount, setAmount] = useState('');
  const [name, setName]     = useState('');
  const [note, setNote]     = useState('');

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    await addSaving({
      name: name.trim(),
      amount: parseFloat(amount),
      note: note.trim(),
      date: todayStr(),
    });
    setAmount('');
    setName('');
    setNote('');
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

        <Text style={styles.sheetTitle}>Log Saving</Text>

        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={C.outline}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => {
              if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t);
            }}
            selectionColor={C.primary}
          />
        </View>

        {/* What did you skip? */}
        <Text style={styles.fieldLabel}>What did you skip?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Cab ride, Coffee, Takeout..."
          placeholderTextColor={C.outline}
          value={name}
          onChangeText={setName}
          maxLength={60}
          returnKeyType="next"
          selectionColor={C.primary}
        />

        {/* Notes */}
        <Text style={styles.fieldLabel}>How? <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="e.g. Walked instead of taking a cab..."
          placeholderTextColor={C.outline}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={200}
          selectionColor={C.primary}
        />

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!canSave}>
          <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={C.onPrim} />
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>

      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22 },

  sheetTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.2,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  currencySymbol: { color: C.primary, fontSize: 32, fontWeight: '700' },
  amountInput: {
    color: C.text,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
    minWidth: 100,
    textAlign: 'center',
  },

  fieldLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },

  input: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 18,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: C.onPrim, fontSize: 17, fontWeight: '700' },
});
