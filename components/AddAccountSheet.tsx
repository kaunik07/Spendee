import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useAccountsContext } from '@/store/AccountsContext';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  border:  '#2E2C3B',
  primary: '#82B1FF',
  onPrim:  '#001A60',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddAccountSheet({ sheetRef }: Props) {
  const { addAccount } = useAccountsContext();
  const snapPoints     = useMemo(() => ['65%'], []);
  const keyboardHeight = useKeyboardHeight();
  const [name,       setName]       = useState('');
  const [balanceRaw, setBalanceRaw] = useState('');

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    const balance = parseFloat(balanceRaw) || 0;
    await addAccount(name.trim(), balance);
    setName('');
    setBalanceRaw('');
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

        <Text style={styles.title}>New Account</Text>

        <Text style={styles.label}>Account name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Chase Checking, Savings, Cash..."
          placeholderTextColor={C.outline}
          value={name}
          onChangeText={setName}
          maxLength={60}
          returnKeyType="next"
          selectionColor={C.primary}
        />

        <Text style={styles.label}>
          Current balance <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.amountInputRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={C.outline}
            keyboardType="decimal-pad"
            value={balanceRaw}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setBalanceRaw(t); }}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectionColor={C.primary}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!canSave}>
          <MaterialCommunityIcons name="bank-plus" size={20} color={C.onPrim} />
          <Text style={styles.saveBtnText}>Add Account</Text>
        </TouchableOpacity>

      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22, paddingTop: 4 },

  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
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
    paddingVertical: 14,
    color: C.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },
  currencySymbol: { color: C.textSec, fontSize: 18, fontWeight: '600', marginRight: 4 },
  amountInput: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 14,
  },

  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: C.onPrim, fontSize: 17, fontWeight: '700' },
});
