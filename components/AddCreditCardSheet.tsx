import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useWebSheetBridge } from '@/lib/webSheetBridge';
import WebDrawer from './web/WebDrawer';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  border:  '#2E2C3B',
  primary: '#E8906A',   // coral — credit card accent
  onPrim:  '#2A0A00',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddCreditCardSheet({ sheetRef }: Props) {
  const { addCard }    = useCreditCardsContext();
  const snapPoints     = useMemo(() => ['70%'], []);
  const keyboardHeight = useKeyboardHeight();
  const [webVisible, setWebVisible] = useState(false);
  useWebSheetBridge(sheetRef, setWebVisible);

  const [name,         setName]         = useState('');
  const [limitRaw,     setLimitRaw]     = useState('');
  const [balanceRaw,   setBalanceRaw]   = useState('');
  const [billingRaw,   setBillingRaw]   = useState('');

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = name.trim().length > 0;

  const billingDay = (() => {
    const n = parseInt(billingRaw, 10);
    return n >= 1 && n <= 31 ? n : null;
  })();

  const handleSave = async () => {
    if (!canSave) return;
    const outstanding = parseFloat(balanceRaw) || 0;
    const limit       = parseFloat(limitRaw) || null;
    await addCard(name.trim(), outstanding, limit, billingDay);
    setName('');
    setLimitRaw('');
    setBalanceRaw('');
    setBillingRaw('');
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  const formContent = (
    <>
      {Platform.OS !== 'web' && <Text style={styles.title}>Add Credit Card</Text>}

      {/* Card name */}
      <Text style={styles.label}>Card name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Chase Sapphire, Amex Gold..."
        placeholderTextColor={C.outline}
        value={name}
        onChangeText={setName}
        maxLength={60}
        returnKeyType="next"
        selectionColor={C.primary}
      />

      {/* Credit limit */}
      <Text style={styles.label}>
        Credit limit <Text style={styles.optional}>(optional)</Text>
      </Text>
      <View style={styles.amountInputRow}>
        <Text style={styles.currencySymbol}>$</Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={C.outline}
          keyboardType="decimal-pad"
          value={limitRaw}
          onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setLimitRaw(t); }}
          returnKeyType="next"
          selectionColor={C.primary}
        />
      </View>

      {/* Current outstanding balance */}
      <Text style={styles.label}>
        Current outstanding balance <Text style={styles.optional}>(optional)</Text>
      </Text>
      <Text style={styles.hint}>
        Enter the amount you currently owe on this card.
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
          returnKeyType="next"
          selectionColor={C.primary}
        />
      </View>

      {/* Payment due day */}
      <Text style={styles.label}>
        Payment due day <Text style={styles.optional}>(optional)</Text>
      </Text>
      <Text style={styles.hint}>
        Day of the month your payment is due (1–31). Used for reminders.
      </Text>
      <View style={styles.amountInputRow}>
        <MaterialCommunityIcons name="calendar-clock" size={18} color={C.textSec} style={{ marginRight: 6 }} />
        <TextInput
          style={styles.amountInput}
          placeholder="e.g. 15"
          placeholderTextColor={C.outline}
          keyboardType="number-pad"
          value={billingRaw}
          onChangeText={(t) => { if (/^\d{0,2}$/.test(t)) setBillingRaw(t); }}
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
        <MaterialCommunityIcons name="credit-card-plus-outline" size={20} color={C.onPrim} />
        <Text style={styles.saveBtnText}>Add Card</Text>
      </TouchableOpacity>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <WebDrawer visible={webVisible} onClose={() => setWebVisible(false)} title="Add Credit Card">
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
    marginTop: Platform.OS === 'web' ? 18 : 0,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },
  hint: {
    color: C.outline,
    fontSize: 12,
    marginBottom: 8,
    marginTop: -4,
  },

  input: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    color: C.text,
    fontSize: Platform.OS === 'web' ? 14 : 16,
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
    marginBottom: 20,
  },
  currencySymbol: { color: C.textSec, fontSize: 18, fontWeight: '600', marginRight: 4 },
  amountInput: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
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
