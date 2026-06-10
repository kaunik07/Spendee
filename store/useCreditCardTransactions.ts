import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export interface CreditCardTransaction {
  id: string;
  cardId: string;
  type: 'charge' | 'payment';  // charge = spending, payment = paying off the card
  amount: number;
  note: string;
  date: string;                          // YYYY-MM-DD
  bankAccountId: string | null;          // bank account used for the payment
  linkedBankTransactionId: string | null; // withdrawal record created in that bank account
  createdAt: number;
}

function rowToTxn(row: any): CreditCardTransaction {
  return {
    id:                      row.id,
    cardId:                  row.card_id,
    type:                    row.type,
    amount:                  Number(row.amount),
    note:                    row.note ?? '',
    date:                    row.date,
    bankAccountId:           row.bank_account_id ?? null,
    linkedBankTransactionId: row.linked_bank_transaction_id ?? null,
    createdAt:               row.created_at,
  };
}

function localKey(userId: string) {
  return `@spendee_cc_txns_${userId}`;
}

async function localLoadAll(userId: string): Promise<CreditCardTransaction[]> {
  const raw = await AsyncStorage.getItem(localKey(userId));
  return raw ? JSON.parse(raw) : [];
}

async function localSaveAll(userId: string, all: CreditCardTransaction[]): Promise<void> {
  await AsyncStorage.setItem(localKey(userId), JSON.stringify(all));
}

export function useCreditCardTransactions(
  cardId: string | null,
  userId: string | null,
  storageMode: StorageMode | null,
  externalVersion: number = 0,
) {
  const [transactions, setTransactions] = useState<CreditCardTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => { setTransactions([]); }, [cardId, userId, storageMode]);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !cardId) return;
    const channel = supabase
      .channel(`cc_txns_${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_card_transactions', filter: `card_id=eq.${cardId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cardId, storageMode, refresh]);

  useEffect(() => {
    if (!cardId || !userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      localLoadAll(userId).then((all) => {
        setTransactions(
          all.filter((t) => t.cardId === cardId).sort((a, b) => b.createdAt - a.createdAt)
        );
        setLoading(false);
      });
    } else {
      supabase.from('credit_card_transactions')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setTransactions((data ?? []).map(rowToTxn));
          setLoading(false);
        });
    }
  }, [cardId, userId, storageMode, refreshKey, externalVersion]);

  const addTransaction = useCallback(async (
    type: 'charge' | 'payment',
    amount: number,
    note: string,
    date: string,
    bankAccountId: string | null,
    linkedBankTransactionId: string | null = null,
  ): Promise<CreditCardTransaction | null> => {
    if (!cardId || !userId) return null;

    if (storageMode === 'local') {
      const txn: CreditCardTransaction = {
        id: Date.now().toString(),
        cardId,
        type,
        amount,
        note: note.trim(),
        date,
        bankAccountId,
        linkedBankTransactionId,
        createdAt: Date.now(),
      };
      const all = await localLoadAll(userId);
      await localSaveAll(userId, [txn, ...all]);
      setTransactions((prev) => [txn, ...prev]);
      return txn;
    } else {
      const insertRow: Record<string, any> = {
        card_id:         cardId,
        user_id:         userId,
        type,
        amount,
        note:            note.trim(),
        date,
        bank_account_id: bankAccountId,
        created_at:      Date.now(),
      };
      if (linkedBankTransactionId) insertRow.linked_bank_transaction_id = linkedBankTransactionId;
      const { data } = await supabase.from('credit_card_transactions').insert(insertRow).select().single();
      if (data) {
        const txn = rowToTxn(data);
        setTransactions((prev) => [txn, ...prev]);
        return txn;
      }
      return null;
    }
  }, [cardId, userId, storageMode]);

  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    if (!userId) return;

    if (storageMode === 'local') {
      const all = await localLoadAll(userId);
      await localSaveAll(userId, all.filter((t) => t.id !== id));
    } else {
      await supabase.from('credit_card_transactions').delete().eq('id', id);
    }
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, [userId, storageMode]);

  const clearAllForCard = useCallback(async (): Promise<void> => {
    if (!userId || !cardId || storageMode !== 'local') return;
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.filter((t) => t.cardId !== cardId));
    setTransactions([]);
  }, [userId, cardId, storageMode]);

  return { transactions, loading, addTransaction, deleteTransaction, clearAllForCard, refresh };
}

// ── Standalone utils (used outside the hook context) ──────
export async function addCCTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  data: Omit<CreditCardTransaction, 'id' | 'createdAt'>,
): Promise<string | null> {
  if (storageMode === 'local') {
    const id = Date.now().toString();
    const txn: CreditCardTransaction = { ...data, id, createdAt: Date.now() };
    const all = await localLoadAll(userId);
    await localSaveAll(userId, [txn, ...all]);
    return id;
  } else {
    const insertRow: Record<string, any> = {
      card_id:         data.cardId,
      user_id:         userId,
      type:            data.type,
      amount:          data.amount,
      note:            data.note,
      date:            data.date,
      bank_account_id: data.bankAccountId ?? null,
      created_at:      Date.now(),
    };
    if (data.linkedBankTransactionId) insertRow.linked_bank_transaction_id = data.linkedBankTransactionId;
    const { data: row } = await supabase.from('credit_card_transactions').insert(insertRow).select('id').single();
    return row?.id ?? null;
  }
}

export async function updateCCTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  txnId: string,
  updates: Partial<Pick<CreditCardTransaction, 'amount' | 'note' | 'date'>>,
): Promise<void> {
  if (storageMode === 'local') {
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.map((t) => (t.id === txnId ? { ...t, ...updates } : t)));
  } else {
    await supabase.from('credit_card_transactions').update(updates).eq('id', txnId);
  }
}

export async function deleteCCTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  txnId: string,
): Promise<void> {
  if (storageMode === 'local') {
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.filter((t) => t.id !== txnId));
  } else {
    await supabase.from('credit_card_transactions').delete().eq('id', txnId);
  }
}
