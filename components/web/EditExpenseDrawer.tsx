// Edit an existing expense in the right-side drawer — the same chrome
// AddExpenseSheet uses on web, so editing feels like adding rather than a
// full page navigation. Save logic (reversing the old payment source's
// balance/transaction, then applying the new one) is identical to the
// mobile edit screen in app/edit-expense/[id].tsx.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CategoryPickerSheet from '@/components/CategoryPickerSheet';
import SubcategorySection from '@/components/SubcategorySection';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import WebDrawer from '@/components/web/WebDrawer';
import { LEARNED_DETAIL_KEYS } from '@/constants/subcategories';
import { Colors, getCategoryById } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { SyncOp } from '@/store/syncQueue';
import { addAccountTransactionDirect, deleteAccountTransactionDirect, updateAccountTransactionDirect } from '@/store/useAccountTransactions';
import { addCCTransactionDirect, deleteCCTransactionDirect, updateCCTransactionDirect } from '@/store/useCreditCardTransactions';

type PaymentType = 'bank_account' | 'credit_card' | null;

const BANK_BLUE = '#82B1FF';
const CARD_CORAL = '#E8906A';

interface Props {
  expenseId: string | null;
  visible: boolean;
  onClose: () => void;
}

export default function EditExpenseDrawer({ expenseId, visible, onClose }: Props) {
  const { expenses, updateExpense }             = useExpenseContext();
  const { user, storageMode }                   = useAuthContext();
  const { accounts, updateAccount }             = useAccountsContext();
  const { cards, updateCard, bumpCCTxnVersion } = useCreditCardsContext();
  const categorySheetRef = useRef<BottomSheet>(null);

  const expense = expenses.find((e) => e.id === expenseId) ?? null;

  const [amount,          setAmount]          = useState('');
  const [name,            setName]            = useState('');
  const [note,            setNote]            = useState('');
  const [category,        setCategory]        = useState('other');
  const [subcategory,     setSubcategory]     = useState<string | null>(null);
  const [details,         setDetails]         = useState<Record<string, any>>({});
  const [date,            setDate]            = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [paymentType,     setPaymentType]     = useState<PaymentType>(null);
  const [paymentSourceId, setPaymentSourceId] = useState<string | null>(null);

  // Re-seed the form whenever a different expense is opened (the drawer
  // component stays mounted between openings, so state would otherwise
  // carry over from the previously edited row).
  useEffect(() => {
    if (!expense || !visible) return;
    setAmount(expense.amount.toString());
    setName(expense.name);
    setNote(expense.note ?? '');
    setCategory(expense.category);
    setSubcategory(expense.subcategory ?? null);
    setDetails(expense.details ?? {});
    setDate(expense.date);
    setPaymentType(expense.paymentType ?? null);
    setPaymentSourceId(expense.paymentSourceId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, visible]);

  const dateObj = new Date(date + 'T00:00:00');
  const cat     = getCategoryById(category);
  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;

  const knownStores = useMemo(() => {
    const stores = new Set<string>();
    expenses.forEach((e) => {
      if (e.category === 'groceries' && typeof e.details?.store === 'string' && e.details.store.trim()) {
        stores.add(e.details.store.trim());
      }
    });
    return [...stores];
  }, [expenses]);

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

    const newAmount      = parseFloat(amount);
    const oldAmount      = expense.amount;
    const oldPaymentType = expense.paymentType;
    const oldSourceId    = expense.paymentSourceId;
    const oldLinkedTxnId = expense.linkedTransactionId;
    const newPaymentType = paymentType;
    const newSourceId    = paymentSourceId;

    const txnNote = `${cat.label} - ${name.trim()}`;

    let newLinkedTxnId: string | null = null;
    const bundle: SyncOp[] = [];
    const opId = () => Crypto.randomUUID();

    if (storageMode === 'online') {
      if (oldPaymentType === 'bank_account' && oldSourceId) {
        bundle.push({ id: opId(), kind: 'balanceAccount', accountId: oldSourceId, delta: oldAmount });
        if (oldLinkedTxnId) bundle.push({ id: opId(), kind: 'delete', table: 'account_transactions', rowId: oldLinkedTxnId });
      } else if (oldPaymentType === 'credit_card' && oldSourceId) {
        bundle.push({ id: opId(), kind: 'balanceCard', cardId: oldSourceId, delta: -oldAmount });
        if (oldLinkedTxnId) bundle.push({ id: opId(), kind: 'delete', table: 'credit_card_transactions', rowId: oldLinkedTxnId });
      }
      if (newPaymentType === 'bank_account' && newSourceId) {
        newLinkedTxnId = Crypto.randomUUID();
        bundle.push({ id: opId(), kind: 'insert', table: 'account_transactions', row: { id: newLinkedTxnId, account_id: newSourceId, user_id: user.id, type: 'withdrawal', amount: newAmount, note: txnNote, date, created_at: Date.now() } });
        bundle.push({ id: opId(), kind: 'balanceAccount', accountId: newSourceId, delta: -newAmount });
      } else if (newPaymentType === 'credit_card' && newSourceId) {
        newLinkedTxnId = Crypto.randomUUID();
        bundle.push({ id: opId(), kind: 'insert', table: 'credit_card_transactions', row: { id: newLinkedTxnId, card_id: newSourceId, user_id: user.id, type: 'charge', amount: newAmount, note: txnNote, date, bank_account_id: null, linked_bank_transaction_id: null, created_at: Date.now() } });
        bundle.push({ id: opId(), kind: 'balanceCard', cardId: newSourceId, delta: newAmount });
      }
    } else {
      const paymentUnchanged = newPaymentType === oldPaymentType && newSourceId === oldSourceId;
      if (paymentUnchanged && newPaymentType !== null && oldLinkedTxnId) {
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
        if (oldPaymentType === 'bank_account' && oldSourceId) {
          const acct = accounts.find((a) => a.id === oldSourceId);
          if (acct) await updateAccount(acct.id, acct.name, acct.balance + oldAmount);
          if (oldLinkedTxnId) await deleteAccountTransactionDirect(user.id, storageMode, oldLinkedTxnId);
        } else if (oldPaymentType === 'credit_card' && oldSourceId) {
          const card = cards.find((c) => c.id === oldSourceId);
          if (card) await updateCard(card.id, card.name, card.outstandingBalance - oldAmount, card.creditLimit);
          if (oldLinkedTxnId) await deleteCCTransactionDirect(user.id, storageMode, oldLinkedTxnId);
        }
        if (newPaymentType === 'bank_account' && newSourceId) {
          const acct = accounts.find((a) => a.id === newSourceId);
          if (acct) {
            newLinkedTxnId = await addAccountTransactionDirect(user.id, storageMode, { accountId: newSourceId, type: 'withdrawal', amount: newAmount, note: txnNote, date });
            await updateAccount(acct.id, acct.name, acct.balance - newAmount);
          }
        } else if (newPaymentType === 'credit_card' && newSourceId) {
          const card = cards.find((c) => c.id === newSourceId);
          if (card) {
            newLinkedTxnId = await addCCTransactionDirect(user.id, storageMode, { cardId: newSourceId, type: 'charge', amount: newAmount, note: txnNote, date, bankAccountId: null, linkedBankTransactionId: null });
            await updateCard(card.id, card.name, card.outstandingBalance + newAmount, card.creditLimit);
          }
        }
      }
      if (newPaymentType === 'credit_card' || oldPaymentType === 'credit_card') bumpCCTxnVersion();
    }

    const cleanedDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    );

    await updateExpense(expense.id, {
      name:                name.trim(),
      amount:              newAmount,
      category,
      subcategory,
      details:             Object.keys(cleanedDetails).length > 0 ? cleanedDetails : null,
      note:                note.trim(),
      date,
      paymentType:         newPaymentType,
      paymentSourceId:     newPaymentType ? newSourceId : null,
      linkedTransactionId: newLinkedTxnId,
    }, bundle);

    onClose();
  };

  return (
    <>
      <WebDrawer visible={visible && !!expense} onClose={onClose} title="Edit Expense">
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setAmount(t); }}
            selectionColor={Colors.primary}
            placeholder="0.00"
            placeholderTextColor={Colors.outline}
          />
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={60}
          selectionColor={Colors.primary}
          placeholderTextColor={Colors.outline}
          placeholder="Expense title"
        />

        <Text style={styles.label}>Category</Text>
        <Pressable style={styles.categoryRow} onPress={() => categorySheetRef.current?.expand()}>
          <View style={[styles.catIconWrap, { backgroundColor: cat.color + '22' }]}>
            <MaterialCommunityIcons name={cat.icon as any} size={18} color={cat.color} />
          </View>
          <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} style={{ marginLeft: 'auto' }} />
        </Pressable>

        <SubcategorySection
          category={category}
          subcategory={subcategory}
          details={details}
          onChangeSubcategory={setSubcategory}
          onChangeDetails={setDetails}
          knownStores={knownStores}
          learned={learned}
        />

        <Text style={styles.label}>Notes <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={200}
          selectionColor={Colors.primary}
          placeholderTextColor={Colors.outline}
          placeholder="Additional details..."
        />

        <Pressable style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
          <MaterialCommunityIcons name="calendar-outline" size={14} color={Colors.primary} />
          <Text style={styles.dateText}>
            {dateObj.toLocaleDateString('default', { weekday: 'short', month: 'long', day: 'numeric' })}
          </Text>
          <MaterialCommunityIcons name="pencil-outline" size={12} color={Colors.outline} style={{ marginLeft: 4 }} />
        </Pressable>

        <Text style={styles.label}>Paid with <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.paymentToggle}>
          {([
            { type: null,           label: 'None',    icon: 'cash-remove' },
            { type: 'bank_account', label: 'Bank',    icon: 'bank-outline' },
            { type: 'credit_card',  label: 'Card',    icon: 'credit-card-outline' },
          ] as { type: PaymentType; label: string; icon: string }[]).map(({ type, label, icon }) => {
            const selected = paymentType === type;
            const color = type === 'bank_account' ? BANK_BLUE : type === 'credit_card' ? CARD_CORAL : Colors.outline;
            return (
              <Pressable
                key={String(type)}
                style={[styles.paymentTypeBtn, selected && { backgroundColor: color + '20', borderColor: color + '60' }]}
                onPress={() => handlePaymentTypeChange(type)}>
                <MaterialCommunityIcons name={icon as any} size={13} color={selected ? color : Colors.outline} />
                <Text style={[styles.paymentTypeBtnText, selected && { color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {paymentType === 'bank_account' && accounts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {accounts.map((acc) => {
              const sel = paymentSourceId === acc.id;
              return (
                <Pressable key={acc.id} style={[styles.chip, sel && styles.chipBank]} onPress={() => setPaymentSourceId(sel ? null : acc.id)}>
                  <View style={[styles.chipDot, { backgroundColor: sel ? BANK_BLUE : Colors.outline }]} />
                  <View>
                    <Text style={[styles.chipName, sel && { color: BANK_BLUE }]}>{acc.name}</Text>
                    <Text style={styles.chipSub}>${acc.balance.toFixed(2)}</Text>
                  </View>
                  {sel && <MaterialCommunityIcons name="check-circle" size={13} color={BANK_BLUE} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {paymentType === 'credit_card' && cards.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {cards.map((card) => {
              const sel = paymentSourceId === card.id;
              return (
                <Pressable key={card.id} style={[styles.chip, sel && styles.chipCard]} onPress={() => setPaymentSourceId(sel ? null : card.id)}>
                  <View style={[styles.chipDot, { backgroundColor: sel ? CARD_CORAL : Colors.outline }]} />
                  <View>
                    <Text style={[styles.chipName, sel && { color: CARD_CORAL }]}>{card.name}</Text>
                    <Text style={styles.chipSub}>${card.outstandingBalance.toFixed(2)}</Text>
                  </View>
                  {sel && <MaterialCommunityIcons name="check-circle" size={13} color={CARD_CORAL} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}>
          <MaterialCommunityIcons name="check" size={19} color={Colors.onPrimary} />
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </Pressable>
      </WebDrawer>

      {/* Rendered as a SIBLING of the drawer, not nested inside it — two
          modals stacked as siblings layer predictably, whereas a modal
          nested inside another modal's tree does not on react-native-web. */}
      <CategoryPickerSheet
        sheetRef={categorySheetRef}
        selected={category}
        onSelect={handleCategorySelect}
      />

      <WebDatePickerModal
        visible={showDatePicker}
        date={date}
        maxDate={new Date().toISOString().split('T')[0]}
        onSelect={(d) => { setDate(d); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  amountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainer, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  currencySymbol: { color: Colors.primary, fontSize: 22, fontWeight: '700' },
  amountInput: { color: Colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, minWidth: 80, textAlign: 'center' },

  label: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.05, textTransform: 'uppercase', marginBottom: 8, marginTop: 20 },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  input: { backgroundColor: Colors.surfaceContainer, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },

  categoryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainer, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  catIconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 14, fontWeight: '600' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 18 },
  dateText: { color: Colors.primary, fontSize: 13 },

  paymentToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  paymentTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceContainer },
  paymentTypeBtnText: { color: Colors.outline, fontSize: 12, fontWeight: '600' },

  chipsRow: { gap: 8, paddingBottom: 4, paddingRight: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceContainer, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  chipBank: { borderColor: '#82B1FF80', backgroundColor: '#82B1FF12' },
  chipCard: { borderColor: '#E8906A80', backgroundColor: '#E8906A12' },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipName: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  chipSub: { color: Colors.outline, fontSize: 11, marginTop: 1 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 15, marginTop: 28,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
