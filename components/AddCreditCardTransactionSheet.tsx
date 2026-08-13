import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { BankAccount } from '@/store/useAccounts';
import { useWebSheetBridge } from '@/lib/webSheetBridge';
import WebDrawer from './web/WebDrawer';

const C = {
  bg:        '#1C1B23',
  surface:   '#252336',
  surfaceHi: '#2E2C3B',
  border:    '#2E2C3B',
  text:      '#E6E1E5',
  textSec:   '#CAC4D0',
  outline:   '#938F99',
  bankBlue:  '#82B1FF',
  charge:    '#F2B8B5',
  onCharge:  '#370002',
  payment:   '#A8EDBB',
  onPayment: '#003919',
};

type TxnType = 'charge' | 'payment';

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
  accounts: BankAccount[];
  onSave:   (type: TxnType, amount: number, note: string, bankAccountId: string | null) => Promise<void>;
}

export default function AddCreditCardTransactionSheet({ sheetRef, accounts, onSave }: Props) {
  const snapPoints     = useMemo(() => ['75%'], []);
  const keyboardHeight = useKeyboardHeight();
  const [webVisible, setWebVisible] = useState(false);
  useWebSheetBridge(sheetRef, setWebVisible);

  const [type,           setType]          = useState<TxnType>('charge');
  const [amount,         setAmount]        = useState('');
  const [note,           setNote]          = useState('');
  const [bankAccountId,  setBankAccountId] = useState<string | null>(null);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    await onSave(type, parseFloat(amount), note.trim(), type === 'payment' ? bankAccountId : null);
    setAmount('');
    setNote('');
    setType('charge');
    setBankAccountId(null);
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  const handleTypeChange = (t: TxnType) => {
    setType(t);
    if (t === 'charge') setBankAccountId(null);
  };

  const isCharge = type === 'charge';
  const accent   = isCharge ? C.charge : C.payment;
  const onAccent = isCharge ? C.onCharge : C.onPayment;

  const formContent = (
    <>
      {/* Type toggle */}
      <View style={styles.typeToggle}>
        <TouchableOpacity
          style={[styles.typeBtn, isCharge && { backgroundColor: C.charge }]}
          onPress={() => handleTypeChange('charge')}
          activeOpacity={0.8}>
          <MaterialCommunityIcons
            name="credit-card-outline"
            size={18}
            color={isCharge ? C.onCharge : C.outline}
          />
          <Text style={[styles.typeBtnText, isCharge && { color: C.onCharge }]}>
            New Charge
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, !isCharge && { backgroundColor: C.payment }]}
          onPress={() => handleTypeChange('payment')}
          activeOpacity={0.8}>
          <MaterialCommunityIcons
            name="cash-check"
            size={18}
            color={!isCharge ? C.onPayment : C.outline}
          />
          <Text style={[styles.typeBtnText, !isCharge && { color: C.onPayment }]}>
            Card Payment
          </Text>
        </TouchableOpacity>
      </View>

      {/* Amount */}
      <View style={[styles.amountRow, { borderColor: accent + '60' }]}>
        <Text style={[styles.currency, { color: accent }]}>$</Text>
        <TextInput
          style={[styles.amountInput, { color: accent }]}
          placeholder="0.00"
          placeholderTextColor={C.outline}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
          selectionColor={accent}
        />
      </View>

      {/* Bank account picker — only for payments */}
      {!isCharge && accounts.length > 0 && (
        <>
          <Text style={styles.label}>
            Paid from <Text style={styles.optional}>(optional)</Text>
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountsRow}
            keyboardShouldPersistTaps="handled">
            {accounts.map((acc) => {
              const selected = bankAccountId === acc.id;
              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accountChip, selected && styles.accountChipSelected]}
                  onPress={() => setBankAccountId(selected ? null : acc.id)}
                  activeOpacity={0.75}>
                  <View style={[styles.chipDot, { backgroundColor: selected ? C.bankBlue : C.outline }]} />
                  <View>
                    <Text style={[styles.chipName, selected && { color: C.bankBlue }]}>
                      {acc.name}
                    </Text>
                    <Text style={styles.chipBalance}>${acc.balance.toFixed(2)}</Text>
                  </View>
                  {selected && (
                    <MaterialCommunityIcons name="check-circle" size={16} color={C.bankBlue} style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Note */}
      <Text style={styles.label}>
        Note <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder={isCharge ? 'e.g. Amazon, Dinner, Flights...' : 'e.g. Monthly payment, Full payoff...'}
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
          name={isCharge ? 'credit-card-outline' : 'cash-check'}
          size={20}
          color={onAccent}
        />
        <Text style={[styles.saveBtnText, { color: onAccent }]}>
          {isCharge ? 'Record Charge' : 'Record Payment'}
        </Text>
      </TouchableOpacity>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <WebDrawer visible={webVisible} onClose={() => setWebVisible(false)} title="Card Transaction">
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
  currency: { fontSize: Platform.OS === 'web' ? 22 : 32, fontWeight: '700' },
  amountInput: {
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
    marginBottom: 10,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },

  accountsRow:       { gap: 8, paddingBottom: 16, paddingRight: 4 },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  accountChipSelected: {
    borderColor: C.bankBlue + '80',
    backgroundColor: C.bankBlue + '12',
  },
  chipDot:     { width: 7, height: 7, borderRadius: 4 },
  chipName:    { color: C.text, fontSize: 13, fontWeight: '600' },
  chipBalance: { color: C.outline, fontSize: 11, marginTop: 1 },

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
