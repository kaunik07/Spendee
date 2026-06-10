import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CURRENCIES } from '@/constants/currencies';
import { useTripsContext } from '@/store/TripsContext';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border:  '#2E2C3B',
  trip:    '#FFB74D',
  onTrip:  '#1A1000',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddTripSheet({ sheetRef }: Props) {
  const { addTrip } = useTripsContext();
  const snapPoints = useMemo(() => ['65%'], []);

  const [name,           setName]           = useState('');
  const [currency,       setCurrency]       = useState('USD');
  const [conversionRate, setConversionRate] = useState('');

  const isUSD      = currency === 'USD';
  const rateIsZero = !isUSD && conversionRate !== '' && parseFloat(conversionRate) <= 0;
  const canSave    = name.trim().length > 0 && (isUSD || parseFloat(conversionRate) > 0);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const handleSave = async () => {
    if (!canSave) return;
    const rate = isUSD ? 1 : parseFloat(conversionRate);
    await addTrip(name.trim(), currency, rate);
    setName('');
    setCurrency('USD');
    setConversionRate('');
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  const handleCurrencySelect = (code: string) => {
    setCurrency(code);
    if (code === 'USD') setConversionRate('');
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
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>New Trip</Text>

        {/* Trip Name */}
        <Text style={styles.label}>Trip Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Paris 2025, Road Trip..."
          placeholderTextColor={C.outline}
          value={name}
          onChangeText={setName}
          maxLength={40}
          returnKeyType="next"
          selectionColor={C.trip}
        />

        {/* Currency */}
        <Text style={styles.label}>Currency</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.currencyRow}
          keyboardShouldPersistTaps="handled">
          {CURRENCIES.map((cur) => {
            const sel = currency === cur.code;
            return (
              <TouchableOpacity
                key={cur.code}
                style={[styles.currencyChip, sel && styles.currencyChipSelected]}
                onPress={() => handleCurrencySelect(cur.code)}
                activeOpacity={0.75}>
                <Text style={[styles.currencySymbol, sel && { color: C.trip }]}>{cur.symbol}</Text>
                <Text style={[styles.currencyCode, sel && { color: C.trip }]}>{cur.code}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Conversion rate (hidden for USD) */}
        {!isUSD && (
          <>
            <Text style={styles.label}>Conversion Rate</Text>
            <View style={[styles.rateRow, rateIsZero && { borderColor: '#F2B8B580' }]}>
              <Text style={styles.rateHint}>$1 USD =</Text>
              <TextInput
                style={styles.rateInput}
                placeholder="e.g. 94"
                placeholderTextColor={C.outline}
                keyboardType="decimal-pad"
                value={conversionRate}
                onChangeText={(t) => { if (/^\d*\.?\d*$/.test(t)) setConversionRate(t); }}
                selectionColor={C.trip}
              />
              <Text style={styles.rateHint}>{currency}</Text>
            </View>
            {rateIsZero && (
              <Text style={styles.rateError}>Conversion rate must be greater than 0</Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!canSave}>
          <MaterialCommunityIcons name="bag-suitcase-outline" size={20} color={C.onTrip} />
          <Text style={styles.saveBtnText}>Create Trip</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22, paddingBottom: 40 },

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

  currencyRow: { gap: 8, paddingBottom: 20, paddingRight: 4 },
  currencyChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    minWidth: 60,
    gap: 2,
  },
  currencyChipSelected: { borderColor: '#FFB74D80', backgroundColor: '#FFB74D12' },
  currencySymbol: { color: C.textSec, fontSize: 15, fontWeight: '700' },
  currencyCode:   { color: C.outline, fontSize: 10, fontWeight: '600' },

  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },
  rateError: { color: '#F2B8B5', fontSize: 12, marginTop: -16, marginBottom: 20, marginLeft: 4 },
  rateHint:  { color: C.textSec, fontSize: 14, fontWeight: '600' },
  rateInput: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  saveBtn: {
    backgroundColor: C.trip,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: C.onTrip, fontSize: 17, fontWeight: '700' },
});
