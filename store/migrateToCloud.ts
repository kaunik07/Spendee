import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Migrates all on-device (guest/local) data for `localUserId` into Supabase
// under `cloudUserId`. Local ids are UUIDs and are preserved, so every
// cross-reference (payment source, linked transactions) stays valid — the
// inserts just run in foreign-key-safe order.
//
// Uses upsert(ignoreDuplicates) keyed on id so a retry after a partial failure
// can't create duplicates. Must be called while the new account's Supabase
// session is active (RLS requires user_id === auth.uid()).
export async function migrateLocalDataToCloud(
  localUserId: string,
  cloudUserId: string,
): Promise<{ error?: string }> {
  try {
    const read = async (prefix: string): Promise<any[]> => {
      const raw = await AsyncStorage.getItem(`${prefix}_${localUserId}`);
      return raw ? (JSON.parse(raw) as any[]) : [];
    };

    const accounts = await read('@spendee_accounts');
    const cards    = await read('@spendee_credit_cards');
    const acctTxns = await read('@spendee_account_txns');
    const ccTxns   = await read('@spendee_cc_txns');
    const expenses = await read('@spendee_expenses');
    const savings  = await read('@spendee_savings');
    const budgets  = await read('@spendee_budgets');

    const push = async (table: string, rows: any[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error(`${table}: ${error.message}`);
    };

    // FK-safe order: parents before children.
    await push('bank_accounts', accounts.map((a) => ({
      id: a.id, user_id: cloudUserId, name: a.name, balance: a.balance, created_at: a.createdAt,
    })));

    await push('credit_cards', cards.map((c) => ({
      id: c.id, user_id: cloudUserId, name: c.name,
      outstanding_balance: c.outstandingBalance, credit_limit: c.creditLimit, created_at: c.createdAt,
    })));

    await push('account_transactions', acctTxns.map((t) => ({
      id: t.id, account_id: t.accountId, user_id: cloudUserId,
      type: t.type, amount: t.amount, note: t.note, date: t.date, created_at: t.createdAt,
    })));

    await push('credit_card_transactions', ccTxns.map((t) => ({
      id: t.id, card_id: t.cardId, user_id: cloudUserId,
      type: t.type, amount: t.amount, note: t.note, date: t.date,
      bank_account_id: t.bankAccountId, linked_bank_transaction_id: t.linkedBankTransactionId,
      created_at: t.createdAt,
    })));

    await push('expenses', expenses.map((e) => ({
      id: e.id, user_id: cloudUserId, name: e.name, amount: e.amount, category: e.category,
      note: e.note, date: e.date, created_at: e.createdAt,
      subcategory: e.subcategory ?? null, details: e.details ?? null,
      payment_type: e.paymentType ?? null, payment_source_id: e.paymentSourceId ?? null,
      linked_transaction_id: e.linkedTransactionId ?? null,
    })));

    await push('savings', savings.map((s) => ({
      id: s.id, user_id: cloudUserId, name: s.name, amount: s.amount, note: s.note, date: s.date, created_at: s.createdAt,
    })));

    await push('budgets', budgets.map((b) => ({
      id: b.id, user_id: cloudUserId, category: b.category, monthly_limit: b.monthlyLimit,
      pinned: b.pinned ?? false, created_at: b.createdAt,
    })));

    // Carry the default-payment preference across (local-only, keyed by user id).
    const dp = await AsyncStorage.getItem(`@spendee_default_payment_${localUserId}`);
    if (dp) await AsyncStorage.setItem(`@spendee_default_payment_${cloudUserId}`, dp);

    return {};
  } catch (e: any) {
    return { error: e?.message ?? 'Migration failed' };
  }
}
