import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useWebSheetBridge } from '@/lib/webSheetBridge';
import WebDrawer from './web/WebDrawer';

const C = {
  bg:        '#1C1B23',
  surface:   '#252336',
  border:    '#2E2C3B',
  text:      '#E6E1E5',
  textSec:   '#CAC4D0',
  outline:   '#938F99',
  deposit:   '#82B1FF',   // blue — money coming in
  onDeposit: '#001A60',
  withdraw:  '#F2B8B5',   // red — money going out
  onWithdraw:'#370002',
};

type TxnType = 'deposit' | 'withdrawal';

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
  onSave:   (type: TxnType, amount: number, note: string) => Promise<void>;
}

export default function AddAccountTransactionSheet({ sheetRef, onSave }: Props) {
  const snapPoints = useMemo(() => ['60%'], []);
  const keyboardHeight = useKeyboardHeight();
  const [webVisible, setWebVisible] = useState(false);
  useWebSheetBridge(sheetRef, setWebVisible);

  const [type,   setType]   = useState<TxnType>('deposit');
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(type, parseFloat(amount), note.trim());
    setAmount('');
    setNote('');
    setType('deposit');
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  const isDeposit = type === 'deposit';
  const accent    = isDeposit ? C.deposit : C.withdraw;
  const onAccent  = isDeposit ? C.onDeposit : C.onWithdraw;

  const formContent = (
    <>
      {/* Type toggle */}
      <View style={styles.typeToggle}>
        <TouchableOpacity
          style={[styles.typeBtn, isDeposit && { backgroundColor: C.deposit }]}
          onPress={() => setType('deposit')}
          activeOpacity={0.8}>
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={18}
            color={isDeposit ? C.onDeposit : C.outline}
          />
          <Text style={[styles.typeBtnText, isDeposit && { color: C.onDeposit }]}>
            Add Money
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, !isDeposit && { backgroundColor: C.withdraw }]}
          onPress={() => setType('withdrawal')}
          activeOpacity={0.8}>
          <MaterialCommunityIcons
            name="minus-circle-outline"
            size={18}
            color={!isDeposit ? C.onWithdraw : C.outline}
          />
          <Text style={[styles.typeBtnText, !isDeposit && { color: C.onWithdraw }]}>
            Deduct Money
          </Text>
        </TouchableOpacity>
      </View>

      {/* Amount */}
      <View style={[styles.amountRow, { borderColor: accent + '60' }]}>
        <Text style={[styles.sign, { color: accent }]}>{isDeposit ? '+' : '−'}</Text>
        <Text style={[styles.currency, { color: accent }]}>$</Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={C.outline}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
          selectionColor={accent}
        />
      </View>

      {/* Note */}
      <Text style={styles.label}>
        Note <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Salary, Rent, Groceries..."
        placeholderTextColor={C.outline}
        value={note}
        onChangeText={setNote}
        maxLength={100}
        returnKeyType="done"
        onSubmitEditing={handleSave}
        selectionColor={accent}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: accent }, !canSave && styles.saveBtnDisabled]}
        onPress={handleSave}
        activeOpacity={0.85}
        disabled={!canSave}>
        <MaterialCommunityIcons
          name={isDeposit ? 'plus-circle' : 'minus-circle'}
          size={20}
          color={onAccent}
        />
        <Text style={[styles.saveBtnText, { color: onAccent }]}>
          {isDeposit ? 'Add Money' : 'Deduct Money'}
        </Text>
      </TouchableOpacity>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <WebDrawer visible={webVisible} onClose={() => setWebVisible(false)} title="Account Transaction">
        {formContent}
      </WebDrawer>
    );
  }

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
        {formContent}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22 },

  typeToggle: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
  },
  typeBtnText: { color: C.outline, fontSize: 14, fontWeight: '700' },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingVertical: Platform.OS === 'web' ? 14 : 18,
    paddingHorizontal: 24,
    marginBottom: Platform.OS === 'web' ? 28 : 24,
    borderWidth: 1.5,
    gap: 4,
  },
  sign:     { fontSize: Platform.OS === 'web' ? 26 : 36, fontWeight: '800', lineHeight: Platform.OS === 'web' ? 36 : 52 },
  currency: { fontSize: Platform.OS === 'web' ? 22 : 32, fontWeight: '700' },
  amountInput: {
    color: C.text,
    fontSize: Platform.OS === 'web' ? 32 : 48,
    fontWeight: '800',
    letterSpacing: -1,
    minWidth: 100,
    textAlign: 'center',
  },

  label: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },
  input: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    color: C.text,
    fontSize: Platform.OS === 'web' ? 14 : 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },

  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { fontSize: 17, fontWeight: '700' },
});
