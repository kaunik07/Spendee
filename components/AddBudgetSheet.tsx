import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Categories, getCategoryById } from '@/constants/theme';
import { useBudgetsContext } from '@/store/BudgetsContext';
import { Budget } from '@/store/useBudgets';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  primary: '#A8EDBB',
  onPrim:  '#003919',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border:  '#2E2C3B',
  danger:  '#F2B8B5',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
  /** When set, the sheet edits this budget instead of creating a new one. */
  editing: Budget | null;
  onClose: () => void;
}

export default function AddBudgetSheet({ sheetRef, editing, onClose }: Props) {
  const { budgets, setBudget, deleteBudget } = useBudgetsContext();
  const keyboardHeight = useKeyboardHeight();
  const snapPoints     = useMemo(() => ['75%'], []);

  const [category, setCategory] = useState<string | null>(null);
  const [amount,   setAmount]   = useState('');
  const [pinned,   setPinned]   = useState(false);

  // Categories that don't have a budget yet (add mode)
  const available = useMemo(
    () => Categories.filter((c) => !budgets.some((b) => b.category === c.id)),
    [budgets]
  );

  // Sync form state when the sheet target changes
  useEffect(() => {
    if (editing) {
      setCategory(editing.category);
      setAmount(String(editing.monthlyLimit));
      setPinned(editing.pinned);
    } else {
      setCategory(null);
      setAmount('');
      setPinned(false);
    }
  }, [editing]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const parsed  = parseFloat(amount);
  const canSave = category !== null && parsed > 0;

  const close = () => {
    Keyboard.dismiss();
    sheetRef.current?.close();
    onClose();
  };

  const handleSave = async () => {
    if (!canSave || !category) return;
    await setBudget(category, parsed, pinned);
    close();
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      'Remove Budget',
      `Stop tracking a budget for ${getCategoryById(editing.category).label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => { await deleteBudget(editing.id); close(); },
        },
      ]
    );
  };

  const cat = category ? getCategoryById(category) : null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: C.bg }}
      handleIndicatorStyle={{ backgroundColor: C.outline }}>
      <BottomSheetScrollView
        contentContainerStyle={[styles.container, { paddingBottom: keyboardHeight || 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title}>{editing ? 'Edit Budget' : 'Set a Budget'}</Text>
        <Text style={styles.subtitle}>
          {editing
            ? 'Adjust the monthly limit for this category'
            : 'Choose a category and a monthly spending limit'}
        </Text>

        {/* Category */}
        {editing && cat ? (
          <View style={styles.editingCatRow}>
            <View style={[styles.catCellIcon, { backgroundColor: cat.color + '22' }]}>
              <MaterialCommunityIcons name={cat.icon as any} size={20} color={cat.color} />
            </View>
            <Text style={[styles.editingCatLabel, { color: cat.color }]}>{cat.label}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Category</Text>
            {available.length === 0 ? (
              <Text style={styles.allSetText}>Every category already has a budget 🎉</Text>
            ) : (
              <View style={styles.catGrid}>
                {available.map((c) => {
                  const selected = category === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catChip, selected && { borderColor: c.color, backgroundColor: c.color + '18' }]}
                      onPress={() => setCategory(selected ? null : c.id)}
                      activeOpacity={0.75}>
                      <MaterialCommunityIcons name={c.icon as any} size={15} color={selected ? c.color : C.outline} />
                      <Text style={[styles.catChipText, selected && { color: c.color }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Monthly limit */}
        <Text style={styles.fieldLabel}>Monthly limit</Text>
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
          <Text style={styles.perMonth}>/ month</Text>
        </View>

        {/* Pin to Home */}
        <View style={styles.pinRow}>
          <MaterialCommunityIcons
            name={pinned ? 'pin' : 'pin-outline'}
            size={17}
            color={pinned ? C.primary : C.outline}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pinLabel, pinned && { color: C.primary }]}>Pin to Home</Text>
            <Text style={styles.pinHint}>Show remaining budget as a card on the Home tab</Text>
          </View>
          <Switch
            value={pinned}
            onValueChange={setPinned}
            trackColor={{ false: C.border, true: C.primary + '60' }}
            thumbColor={pinned ? C.primary : C.outline}
          />
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.85}>
          <MaterialCommunityIcons name="check" size={20} color={C.onPrim} />
          <Text style={styles.saveBtnText}>{editing ? 'Save Changes' : 'Set Budget'}</Text>
        </TouchableOpacity>

        {/* Delete (edit mode) */}
        {editing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
            <MaterialCommunityIcons name="trash-can-outline" size={17} color={C.danger} />
            <Text style={styles.deleteBtnText}>Remove Budget</Text>
          </TouchableOpacity>
        )}

      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 22 },

  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: C.outline,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },

  fieldLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.border,
  },
  catChipText: { color: C.textSec, fontSize: 13, fontWeight: '600' },
  allSetText:  { color: C.outline, fontSize: 13, marginBottom: 20 },

  editingCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  catCellIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  editingCatLabel: { fontSize: 16, fontWeight: '700' },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  currencySymbol: { color: C.primary, fontSize: 26, fontWeight: '700' },
  amountInput: {
    color: C.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    minWidth: 90,
    textAlign: 'center',
  },
  perMonth: { color: C.outline, fontSize: 13, fontWeight: '600' },

  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 22,
  },
  pinLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  pinHint:  { color: C.outline, fontSize: 11, marginTop: 2 },

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
  saveBtnText: { color: C.onPrim, fontSize: 16, fontWeight: '700' },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    marginTop: 10,
  },
  deleteBtnText: { color: C.danger, fontSize: 14, fontWeight: '600' },
});
