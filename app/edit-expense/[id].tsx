import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CategoryPickerSheet from '@/components/CategoryPickerSheet';
import SubcategorySection from '@/components/SubcategorySection';
import { LEARNED_DETAIL_KEYS } from '@/constants/subcategories';
import { Colors, getCategoryById } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import {
  addAccountTransactionDirect,
  deleteAccountTransactionDirect,
  updateAccountTransactionDirect,
} from '@/store/useAccountTransactions';
import {
  addCCTransactionDirect,
  deleteCCTransactionDirect,
  updateCCTransactionDirect,
} from '@/store/useCreditCardTransactions';

type PaymentType = 'bank_account' | 'credit_card' | null;

const C = {
  bg:        Colors.background,
  surface:   Colors.surface,
  border:    Colors.border,
  primary:   Colors.primary,
  onPrim:    Colors.onPrimary,
  text:      Colors.text,
  textSec:   Colors.textSecondary,
  outline:   Colors.outline,
  danger:    Colors.danger,
  bankBlue:  '#82B1FF',
  cardCoral: '#E8906A',
};

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { expenses, updateExpense }                     = useExpenseContext();
  const { user, storageMode }                           = useAuthContext();
  const { accounts, updateAccount }                     = useAccountsContext();
  const { cards, updateCard, bumpCCTxnVersion }         = useCreditCardsContext();
  const categorySheetRef                = useRef<BottomSheet>(null);

  const expense = expenses.find((e) => e.id === id);

  const [amount,          setAmount]          = useState(expense?.amount.toString() ?? '');
  const [name,            setName]            = useState(expense?.name ?? '');
  const [note,            setNote]            = useState(expense?.note ?? '');
  const [category,        setCategory]        = useState(expense?.category ?? 'other');
  const [subcategory,     setSubcategory]     = useState<string | null>(expense?.subcategory ?? null);
  const [details,         setDetails]         = useState<Record<string, any>>(expense?.details ?? {});
  const [date,            setDate]            = useState(expense?.date ?? new Date().toISOString().split('T')[0]);
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [paymentType,     setPaymentType]     = useState<PaymentType>(expense?.paymentType ?? null);
  const [paymentSourceId, setPaymentSourceId] = useState<string | null>(expense?.paymentSourceId ?? null);

  const dateObj = new Date(date + 'T00:00:00');
  const cat     = getCategoryById(category);
  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;

  // Store names the user has typed before (groceries autocomplete)
  const knownStores = useMemo(() => {
    const stores = new Set<string>();
    expenses.forEach((e) => {
      if (e.category === 'groceries' && typeof e.details?.store === 'string' && e.details.store.trim()) {
        stores.add(e.details.store.trim());
      }
    });
    return [...stores];
  }, [expenses]);

  // Past values for suggest-text detail fields (e.g. restaurants)
  const learned = useMemo(() => {
    const map: Record<string, Map<string, string>> = {};
    expenses.forEach((e) => {
      LEARNED_DETAIL_KEYS.forEach((key) => {
        const v = e.details?.[key];
        if (typeof v === 'string' && v.trim()) {
          (map[key] ??= new Map()).set(v.trim().toLowerCase(), v.trim());
        }
      });
    });
    return Object.fromEntries(Object.entries(map).map(([k, m]) => [k, [...m.values()]]));
  }, [expenses]);

  const handleCategorySelect = (catId: string) => {
    setCategory(catId);
    setSubcategory(null);
    setDetails({});
  };

  const handlePaymentTypeChange = (type: PaymentType) => {
    setPaymentType(type);
    setPaymentSourceId(null);
  };

  const handleSave = async () => {
    if (!canSave || !expense || !user?.id) return;
    Keyboard.dismiss();

    const newAmount        = parseFloat(amount);
    const oldAmount        = expense.amount;
    const oldPaymentType   = expense.paymentType;
    const oldSourceId      = expense.paymentSourceId;
    const oldLinkedTxnId   = expense.linkedTransactionId;
    const newPaymentType   = paymentType;
    const newSourceId      = paymentSourceId;

    const txnNote = `${cat.label} - ${name.trim()}`;

    let newLinkedTxnId: string | null = null;

    const paymentUnchanged =
      newPaymentType === oldPaymentType && newSourceId === oldSourceId;

    if (paymentUnchanged && newPaymentType !== null && oldLinkedTxnId) {
      // Same payment source — just update amount if it changed
      const diff = newAmount - oldAmount;
      if (diff !== 0) {
        if (newPaymentType === 'bank_account' && newSourceId) {
          const acct = accounts.find((a) => a.id === newSourceId);
          if (acct) await updateAccount(acct.id, acct.name, acct.balance - diff);
          await updateAccountTransactionDirect(user.id, storageMode, oldLinkedTxnId, { amount: newAmount });
        } else if (newPaymentType === 'credit_card' && newSourceId) {
          const card = cards.find((c) => c.id === newSourceId);
          if (card) await updateCard(card.id, card.name, card.outstandingBalance + diff, card.creditLimit);
          await updateCCTransactionDirect(user.id, storageMode, oldLinkedTxnId, { amount: newAmount });
        }
      }
      newLinkedTxnId = oldLinkedTxnId;
    } else {
      // Reverse old payment
      if (oldPaymentType === 'bank_account' && oldSourceId) {
        const acct = accounts.find((a) => a.id === oldSourceId);
        if (acct) await updateAccount(acct.id, acct.name, acct.balance + oldAmount);
        if (oldLinkedTxnId) await deleteAccountTransactionDirect(user.id, storageMode, oldLinkedTxnId);
      } else if (oldPaymentType === 'credit_card' && oldSourceId) {
        const card = cards.find((c) => c.id === oldSourceId);
        if (card) await updateCard(card.id, card.name, card.outstandingBalance - oldAmount, card.creditLimit);
        if (oldLinkedTxnId) await deleteCCTransactionDirect(user.id, storageMode, oldLinkedTxnId);
      }

      // Apply new payment
      if (newPaymentType === 'bank_account' && newSourceId) {
        const acct = accounts.find((a) => a.id === newSourceId);
        if (acct) {
          newLinkedTxnId = await addAccountTransactionDirect(user.id, storageMode, {
            accountId: newSourceId,
            type:      'withdrawal',
            amount:    newAmount,
            note:      txnNote,
            date,
          });
          await updateAccount(acct.id, acct.name, acct.balance - newAmount);
        }
      } else if (newPaymentType === 'credit_card' && newSourceId) {
        const card = cards.find((c) => c.id === newSourceId);
        if (card) {
          newLinkedTxnId = await addCCTransactionDirect(user.id, storageMode, {
            cardId:                  newSourceId,
            type:                    'charge',
            amount:                  newAmount,
            note:                    txnNote,
            date,
            bankAccountId:           null,
            linkedBankTransactionId: null,
          });
          await updateCard(card.id, card.name, card.outstandingBalance + newAmount, card.creditLimit);
        }
      }
    }

    if (newPaymentType === 'credit_card' || oldPaymentType === 'credit_card') bumpCCTxnVersion();

    const cleanedDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    );

    await updateExpense(id, {
      name:               name.trim(),
      amount:             newAmount,
      category,
      subcategory,
      details:            Object.keys(cleanedDetails).length > 0 ? cleanedDetails : null,
      note:               note.trim(),
      date,
      paymentType:        newPaymentType,
      paymentSourceId:    newPaymentType ? newSourceId : null,
      linkedTransactionId: newLinkedTxnId,
    });

    router.back();
  };

  if (!expense) return null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Expense</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.saveBtn, !canSave && { opacity: 0.35 }]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
            selectionColor={C.primary}
            placeholder="0.00"
            placeholderTextColor={C.outline}
          />
        </View>

        {/* Name */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={60}
          returnKeyType="next"
          selectionColor={C.primary}
          placeholderTextColor={C.outline}
          placeholder="Expense title"
        />

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <Pressable
          style={styles.categoryRow}
          onPress={() => { Keyboard.dismiss(); categorySheetRef.current?.expand(); }}>
          <View style={[styles.catIconWrap, { backgroundColor: cat.color + '22' }]}>
            <MaterialCommunityIcons name={cat.icon as any} size={20} color={cat.color} />
          </View>
          <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={C.outline} style={{ marginLeft: 'auto' }} />
        </Pressable>

        {/* Subcategory + details */}
        <SubcategorySection
          category={category}
          subcategory={subcategory}
          details={details}
          onChangeSubcategory={setSubcategory}
          onChangeDetails={setDetails}
          knownStores={knownStores}
          learned={learned}
        />

        {/* Note */}
        <Text style={styles.label}>Notes <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={200}
          selectionColor={C.primary}
          placeholderTextColor={C.outline}
          placeholder="Additional details..."
        />

        {/* Date */}
        <Pressable style={styles.dateRow} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}>
          <MaterialCommunityIcons name="calendar-outline" size={15} color={C.primary} />
          <Text style={styles.dateText}>
            {dateObj.toLocaleDateString('default', { weekday: 'short', month: 'long', day: 'numeric' })}
          </Text>
          <MaterialCommunityIcons name="pencil-outline" size={13} color={C.outline} style={{ marginLeft: 4 }} />
        </Pressable>

        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={dateObj} mode="date" display="default" maximumDate={new Date()}
            onChange={(_, sel) => { setShowDatePicker(false); if (sel) setDate(sel.toISOString().split('T')[0]); }}
          />
        )}
        {showDatePicker && Platform.OS === 'ios' && (
          <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
              <Pressable style={styles.datePickerCard} onPress={() => {}}>
                <DateTimePicker
                  value={dateObj} mode="date" display="spinner" maximumDate={new Date()}
                  textColor={C.text}
                  onChange={(_, sel) => { if (sel) setDate(sel.toISOString().split('T')[0]); }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* Payment method */}
        <Text style={styles.label}>Paid with <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.paymentToggle}>
          {([
            { type: null,           label: 'None',    icon: 'cash-remove' },
            { type: 'bank_account', label: 'Bank',    icon: 'bank-outline' },
            { type: 'credit_card',  label: 'Card',    icon: 'credit-card-outline' },
          ] as { type: PaymentType; label: string; icon: string }[]).map(({ type, label, icon }) => {
            const selected = paymentType === type;
            const color = type === 'bank_account' ? C.bankBlue : type === 'credit_card' ? C.cardCoral : C.outline;
            return (
              <TouchableOpacity
                key={String(type)}
                style={[styles.paymentTypeBtn, selected && { backgroundColor: color + '20', borderColor: color + '60' }]}
                onPress={() => handlePaymentTypeChange(type)}
                activeOpacity={0.75}>
                <MaterialCommunityIcons name={icon as any} size={14} color={selected ? color : C.outline} />
                <Text style={[styles.paymentTypeBtnText, selected && { color }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {paymentType === 'bank_account' && accounts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} keyboardShouldPersistTaps="handled">
            {accounts.map((acc) => {
              const sel = paymentSourceId === acc.id;
              return (
                <TouchableOpacity key={acc.id} style={[styles.chip, sel && styles.chipBank]} onPress={() => setPaymentSourceId(sel ? null : acc.id)} activeOpacity={0.75}>
                  <View style={[styles.chipDot, { backgroundColor: sel ? C.bankBlue : C.outline }]} />
                  <View>
                    <Text style={[styles.chipName, sel && { color: C.bankBlue }]}>{acc.name}</Text>
                    <Text style={styles.chipSub}>${acc.balance.toFixed(2)}</Text>
                  </View>
                  {sel && <MaterialCommunityIcons name="check-circle" size={14} color={C.bankBlue} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {paymentType === 'credit_card' && cards.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} keyboardShouldPersistTaps="handled">
            {cards.map((card) => {
              const sel = paymentSourceId === card.id;
              return (
                <TouchableOpacity key={card.id} style={[styles.chip, sel && styles.chipCard]} onPress={() => setPaymentSourceId(sel ? null : card.id)} activeOpacity={0.75}>
                  <View style={[styles.chipDot, { backgroundColor: sel ? C.cardCoral : C.outline }]} />
                  <View>
                    <Text style={[styles.chipName, sel && { color: C.cardCoral }]}>{card.name}</Text>
                    <Text style={styles.chipSub}>${card.outstandingBalance.toFixed(2)}</Text>
                  </View>
                  {sel && <MaterialCommunityIcons name="check-circle" size={14} color={C.cardCoral} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

      </ScrollView>

      <CategoryPickerSheet
        sheetRef={categorySheetRef}
        selected={category}
        onSelect={handleCategorySelect}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: { color: C.onPrim, fontSize: 14, fontWeight: '700' },

  content: { paddingHorizontal: 18, paddingBottom: 48 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  currencySymbol: { color: C.primary, fontSize: 28, fontWeight: '700' },
  amountInput: {
    color: C.text,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'center',
  },

  label: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },

  input: {
    backgroundColor: C.surface,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
    marginBottom: 16,
  },
  catIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catLabel:    { fontSize: 15, fontWeight: '600' },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  dateText: { color: C.primary, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  datePickerCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 32, paddingTop: 16, paddingHorizontal: 16,
  },
  datePickerDone: {
    alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: C.primary, borderRadius: 12, marginTop: 8,
  },
  datePickerDoneText: { color: C.onPrim, fontWeight: '700', fontSize: 15 },

  paymentToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  paymentTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  paymentTypeBtnText: { color: C.outline, fontSize: 12, fontWeight: '600' },

  chipsRow:  { gap: 8, paddingBottom: 16, paddingRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: C.border,
  },
  chipBank: { borderColor: '#82B1FF80', backgroundColor: '#82B1FF12' },
  chipCard: { borderColor: '#E8906A80', backgroundColor: '#E8906A12' },
  chipDot:  { width: 7, height: 7, borderRadius: 4 },
  chipName: { color: C.text, fontSize: 13, fontWeight: '600' },
  chipSub:  { color: C.outline, fontSize: 11, marginTop: 1 },
});
