import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
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
import CategoryPickerSheet from './CategoryPickerSheet';
import SubcategorySection from './SubcategorySection';
import WebDatePickerModal from './WebDatePickerModal';
import WebDrawer from './web/WebDrawer';
import { useWebSheetBridge } from '@/lib/webSheetBridge';
import { LEARNED_DETAIL_KEYS } from '@/constants/subcategories';
import { getCategoryById } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useAuthContext } from '@/store/AuthContext';
import { addAccountTransactionDirect } from '@/store/useAccountTransactions';
import { addCCTransactionDirect } from '@/store/useCreditCardTransactions';
import { useDefaultPayment } from '@/store/useDefaultPayment';
import { SyncOp } from '@/store/syncQueue';

const C = {
  bg:        '#1C1B23',
  surface:   '#252336',
  high:      '#2E2C3B',
  primary:   '#A8EDBB',
  onPrim:    '#003919',
  text:      '#E6E1E5',
  textSec:   '#CAC4D0',
  outline:   '#938F99',
  border:    '#2E2C3B',
  danger:    '#F2B8B5',
  bankBlue:  '#82B1FF',
  cardCoral: '#E8906A',
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

type PaymentType = 'bank_account' | 'credit_card' | null;

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AddExpenseSheet({ sheetRef }: Props) {
  const { addExpense, expenses }                 = useExpenseContext();
  const { user, storageMode }                    = useAuthContext();
  const { accounts, updateAccount }              = useAccountsContext();
  const { cards, updateCard, bumpCCTxnVersion }  = useCreditCardsContext();
  const { defaultPayment }                       = useDefaultPayment(user?.id ?? null);

  const categorySheetRef            = useRef<BottomSheet>(null);
  const snapPoints                  = useMemo(() => ['92%'], []);
  const keyboardHeight              = useKeyboardHeight();

  const [amount,          setAmount]          = useState('');
  const [name,            setName]            = useState('');
  const [note,            setNote]            = useState('');
  const [category,        setCategory]        = useState('food');
  const [subcategory,     setSubcategory]     = useState<string | null>(null);
  const [details,         setDetails]         = useState<Record<string, any>>({});
  const [date,            setDate]            = useState(todayStr());
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [paymentType,     setPaymentType]     = useState<PaymentType>(null);
  const [paymentSourceId, setPaymentSourceId] = useState<string | null>(null);
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [webVisible,      setWebVisible]      = useState(false);
  useWebSheetBridge(sheetRef, setWebVisible);

  useEffect(() => {
    if (sheetOpen) {
      setPaymentType(defaultPayment.type);
      setPaymentSourceId(defaultPayment.sourceId);
    }
  }, [sheetOpen, defaultPayment.type, defaultPayment.sourceId]);

  // BottomSheet's onChange doesn't fire on web (it isn't rendered there) —
  // mirror webVisible into the same sheetOpen state so the payment-default
  // effect above still runs when the web drawer opens.
  useEffect(() => {
    if (Platform.OS === 'web') setSheetOpen(webVisible);
  }, [webVisible]);

  const dateObj = new Date(date + 'T00:00:00');
  const cat     = getCategoryById(category);

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

  const handleCategorySelect = (id: string) => {
    setCategory(id);
    setSubcategory(null);
    setDetails({});
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    []
  );

  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;

  const handlePaymentTypeChange = (type: PaymentType) => {
    setPaymentType(type);
    setPaymentSourceId(null);
  };

  const handleSave = async () => {
    if (!canSave || !user?.id) return;
    const parsedAmount = parseFloat(amount);
    let linkedTransactionId: string | null = null;
    const bundle: SyncOp[] = [];

    const txnNote = `${cat.label} - ${name.trim()}`;

    // Online mode: build the payment-source ops (transaction + balance delta)
    // as a bundle queued atomically with the expense — offline-safe. Local
    // (guest) mode writes directly to on-device storage as before.
    if (paymentType === 'bank_account' && paymentSourceId) {
      if (storageMode === 'online') {
        const txnId = Crypto.randomUUID();
        linkedTransactionId = txnId;
        bundle.push({
          id: Crypto.randomUUID(), kind: 'insert', table: 'account_transactions',
          row: { id: txnId, account_id: paymentSourceId, user_id: user.id, type: 'withdrawal', amount: parsedAmount, note: txnNote, date, created_at: Date.now() },
        });
        bundle.push({ id: Crypto.randomUUID(), kind: 'balanceAccount', accountId: paymentSourceId, delta: -parsedAmount });
      } else {
        const account = accounts.find((a) => a.id === paymentSourceId);
        if (account) {
          linkedTransactionId = await addAccountTransactionDirect(user.id, storageMode, {
            accountId: paymentSourceId, type: 'withdrawal', amount: parsedAmount, note: txnNote, date,
          });
          await updateAccount(paymentSourceId, account.name, account.balance - parsedAmount);
        }
      }
    } else if (paymentType === 'credit_card' && paymentSourceId) {
      if (storageMode === 'online') {
        const txnId = Crypto.randomUUID();
        linkedTransactionId = txnId;
        bundle.push({
          id: Crypto.randomUUID(), kind: 'insert', table: 'credit_card_transactions',
          row: { id: txnId, card_id: paymentSourceId, user_id: user.id, type: 'charge', amount: parsedAmount, note: txnNote, date, bank_account_id: null, linked_bank_transaction_id: null, created_at: Date.now() },
        });
        bundle.push({ id: Crypto.randomUUID(), kind: 'balanceCard', cardId: paymentSourceId, delta: parsedAmount });
      } else {
        const card = cards.find((c) => c.id === paymentSourceId);
        if (card) {
          linkedTransactionId = await addCCTransactionDirect(user.id, storageMode, {
            cardId: paymentSourceId, type: 'charge', amount: parsedAmount, note: txnNote, date,
            bankAccountId: null, linkedBankTransactionId: null,
          });
          await updateCard(paymentSourceId, card.name, card.outstandingBalance + parsedAmount, card.creditLimit);
          bumpCCTxnVersion();
        }
      }
    }

    // Strip empty detail values before saving
    const cleanedDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    );

    await addExpense({
      name:                name.trim(),
      amount:              parsedAmount,
      category,
      subcategory,
      details:             Object.keys(cleanedDetails).length > 0 ? cleanedDetails : null,
      note:                note.trim(),
      date,
      paymentType,
      paymentSourceId:     paymentType ? paymentSourceId : null,
      linkedTransactionId,
    }, bundle);

    setAmount('');
    setName('');
    setNote('');
    setCategory('food');
    setSubcategory(null);
    setDetails({});
    setDate(todayStr());
    setPaymentType(defaultPayment.type);
    setPaymentSourceId(defaultPayment.sourceId);
    Keyboard.dismiss();
    sheetRef.current?.close();
  };

  const formContent = (
    <>
      {/* WebDrawer already shows "Add Expense" in its own header — this
          in-content title is only needed on native, where BottomSheet has
          no header chrome of its own. */}
      {Platform.OS !== 'web' && <Text style={styles.sheetTitle}>Add Expense</Text>}

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
          <Text style={styles.fieldLabel}>What&apos;s this for?</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Lunch, Uber ride, Netflix..."
            placeholderTextColor={C.outline}
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="next"
            selectionColor={C.primary}
          />

          {/* Category */}
          <Text style={styles.fieldLabel}>Category</Text>
          <Pressable
            style={styles.categoryRow}
            onPress={() => { Keyboard.dismiss(); categorySheetRef.current?.expand(); }}>
            <View style={[styles.catIconWrap, { backgroundColor: cat.color + '22' }]}>
              <MaterialCommunityIcons name={cat.icon as any} size={22} color={cat.color} />
            </View>
            <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.outline} style={{ marginLeft: 'auto' }} />
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

          {/* Paid with */}
          <Text style={styles.fieldLabel}>
            Paid with <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.paymentToggle}>
            {([
              { type: null,           label: 'None',         icon: 'cash-remove' },
              { type: 'bank_account', label: 'Bank Account', icon: 'bank-outline' },
              { type: 'credit_card',  label: 'Credit Card',  icon: 'credit-card-outline' },
            ] as { type: PaymentType; label: string; icon: string }[]).map(({ type, label, icon }) => {
              const selected = paymentType === type;
              const color = type === 'bank_account' ? C.bankBlue : type === 'credit_card' ? C.cardCoral : C.outline;
              return (
                <TouchableOpacity
                  key={String(type)}
                  style={[styles.paymentTypeBtn, selected && { backgroundColor: color + '20', borderColor: color + '60' }]}
                  onPress={() => handlePaymentTypeChange(type)}
                  activeOpacity={0.75}>
                  <MaterialCommunityIcons name={icon as any} size={15} color={selected ? color : C.outline} />
                  <Text style={[styles.paymentTypeBtnText, selected && { color }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Bank account chips */}
          {paymentType === 'bank_account' && accounts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sourceChipsRow}
              keyboardShouldPersistTaps="handled">
              {accounts.map((acc) => {
                const selected = paymentSourceId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.sourceChip, selected && styles.sourceChipSelectedBank]}
                    onPress={() => setPaymentSourceId(selected ? null : acc.id)}
                    activeOpacity={0.75}>
                    <View style={[styles.chipDot, { backgroundColor: selected ? C.bankBlue : C.outline }]} />
                    <View>
                      <Text style={[styles.chipName, selected && { color: C.bankBlue }]}>{acc.name}</Text>
                      <Text style={styles.chipSub}>${acc.balance.toFixed(2)}</Text>
                    </View>
                    {selected && <MaterialCommunityIcons name="check-circle" size={15} color={C.bankBlue} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Credit card chips */}
          {paymentType === 'credit_card' && cards.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sourceChipsRow}
              keyboardShouldPersistTaps="handled">
              {cards.map((card) => {
                const selected = paymentSourceId === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.sourceChip, selected && styles.sourceChipSelectedCard]}
                    onPress={() => setPaymentSourceId(selected ? null : card.id)}
                    activeOpacity={0.75}>
                    <View style={[styles.chipDot, { backgroundColor: selected ? C.cardCoral : C.outline }]} />
                    <View>
                      <Text style={[styles.chipName, selected && { color: C.cardCoral }]}>{card.name}</Text>
                      <Text style={styles.chipSub}>${card.outstandingBalance.toFixed(2)}</Text>
                    </View>
                    {selected && <MaterialCommunityIcons name="check-circle" size={15} color={C.cardCoral} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Notes */}
          <Text style={styles.fieldLabel}>Notes <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="Add any additional details..."
            placeholderTextColor={C.outline}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={200}
            selectionColor={C.primary}
          />

          {/* Date */}
          <Pressable style={styles.dateRow} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}>
            <MaterialCommunityIcons name="calendar-outline" size={16} color={C.primary} />
            <Text style={[styles.dateText, { color: C.primary }]}>
              {dateObj.toLocaleDateString('default', { weekday: 'short', month: 'long', day: 'numeric' })}
            </Text>
            <MaterialCommunityIcons name="pencil-outline" size={14} color={C.outline} style={{ marginLeft: 4 }} />
          </Pressable>

          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={dateObj}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={(_, selected) => {
                setShowDatePicker(false);
                if (selected) setDate(selected.toISOString().split('T')[0]);
              }}
            />
          )}
          {showDatePicker && Platform.OS === 'ios' && (
            <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
                <Pressable style={styles.datePickerCard} onPress={() => {}}>
                  <DateTimePicker
                    value={dateObj}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    textColor={C.text}
                    onChange={(_, selected) => { if (selected) setDate(selected.toISOString().split('T')[0]); }}
                    style={{ width: '100%' }}
                  />
                  <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            </Modal>
          )}
          <WebDatePickerModal
            visible={showDatePicker && Platform.OS === 'web'}
            date={date}
            maxDate={new Date().toISOString().split('T')[0]}
            onSelect={(d) => { setDate(d); setShowDatePicker(false); }}
            onClose={() => setShowDatePicker(false)}
          />

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!canSave}>
            <MaterialCommunityIcons name="check" size={20} color={C.onPrim} />
            <Text style={styles.saveBtnText}>Save Expense</Text>
          </TouchableOpacity>
    </>
  );

  return (
    <>
      {Platform.OS === 'web' ? (
        <WebDrawer visible={webVisible} onClose={() => setWebVisible(false)} title="Add Expense">
          {formContent}
        </WebDrawer>
      ) : (
        <BottomSheet
          ref={sheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: C.bg }}
          handleIndicatorStyle={{ backgroundColor: C.outline }}
          onChange={(index) => setSheetOpen(index >= 0)}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.container, { paddingBottom: keyboardHeight || 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {formContent}
          </BottomSheetScrollView>
        </BottomSheet>
      )}

      <CategoryPickerSheet
        sheetRef={categorySheetRef}
        selected={category}
        onSelect={handleCategorySelect}
      />
    </>
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
    paddingVertical: Platform.OS === 'web' ? 14 : 18,
    paddingHorizontal: 24,
    marginBottom: Platform.OS === 'web' ? 28 : 24,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  currencySymbol: { color: C.primary, fontSize: Platform.OS === 'web' ? 22 : 32, fontWeight: '700' },
  amountInput: {
    color: C.text,
    fontSize: Platform.OS === 'web' ? 32 : 48,
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
    marginTop: Platform.OS === 'web' ? 20 : 4,
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
    marginBottom: Platform.OS === 'web' ? 22 : 18,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 10 : 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    marginBottom: Platform.OS === 'web' ? 22 : 18,
  },
  catIconWrap: {
    width: Platform.OS === 'web' ? 32 : 40,
    height: Platform.OS === 'web' ? 32 : 40,
    borderRadius: Platform.OS === 'web' ? 16 : 20,
    alignItems: 'center', justifyContent: 'center',
  },
  catLabel: { fontSize: Platform.OS === 'web' ? 14 : 16, fontWeight: '600' },

  paymentToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Platform.OS === 'web' ? 22 : 12,
  },
  paymentTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  paymentTypeBtnText: { color: C.outline, fontSize: 12, fontWeight: '600' },

  sourceChipsRow: { gap: 8, paddingBottom: 14, paddingRight: 4 },
  sourceChip: {
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
  sourceChipSelectedBank: { borderColor: '#82B1FF80', backgroundColor: '#82B1FF12' },
  sourceChipSelectedCard: { borderColor: '#E8906A80', backgroundColor: '#E8906A12' },
  chipDot:  { width: 7, height: 7, borderRadius: 4 },
  chipName: { color: C.text, fontSize: 13, fontWeight: '600' },
  chipSub:  { color: C.outline, fontSize: 11, marginTop: 1 },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Platform.OS === 'web' ? 28 : 24,
    marginTop: Platform.OS === 'web' ? 4 : 0,
    alignSelf: 'flex-start',
  },
  dateText: { fontSize: 13 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  datePickerCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  datePickerDoneText: { color: C.onPrim, fontWeight: '700', fontSize: 15 },

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
