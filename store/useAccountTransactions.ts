import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface AccountTransaction {
  id: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  note: string;
  date: string;       // YYYY-MM-DD
  createdAt: number;
}

function rowToTxn(row: any): AccountTransaction {
  return {
    id:        row.id,
    accountId: row.account_id,
    type:      row.type,
    amount:    Number(row.amount),
    note:      row.note ?? '',
    date:      row.date,
    createdAt: row.created_at,
  };
}

// Local storage holds all txns for the user; we filter by accountId
function localKey(userId: string) {
  return `@spendee_account_txns_${userId}`;
}

async function localLoadAll(userId: string): Promise<AccountTransaction[]> {
  const raw = await AsyncStorage.getItem(localKey(userId));
  return raw ? JSON.parse(raw) : [];
}

async function localSaveAll(userId: string, all: AccountTransaction[]): Promise<void> {
  await AsyncStorage.setItem(localKey(userId), JSON.stringify(all));
}

export function useAccountTransactions(
  accountId: string | null,
  userId: string | null,
  storageMode: StorageMode | null,
) {
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !accountId) return;
    const channel = supabase
      .channel(`account_txns_${accountId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_transactions', filter: `account_id=eq.${accountId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setTransactions([]); }, [accountId, userId, storageMode]);

  useEffect(() => {
    if (!accountId || !userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      localLoadAll(userId).then((all) => {
        setTransactions(all.filter((t) => t.accountId === accountId)
          .sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      });
    } else {
      const cacheKey = `@spendee_acct_txns_cache_${userId}_${accountId}`;
      Promise.all([
        supabase.from('account_transactions').select('*').eq('account_id', accountId).order('created_at', { ascending: false }),
        getQueue(userId),
      ]).then(async ([res, ops]) => {
        let rows: any[];
        if (res.error) {
          const cached = await AsyncStorage.getItem(cacheKey);
          rows = cached ? JSON.parse(cached) : [];
        } else {
          rows = res.data ?? [];
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rows));
        }
        // Only pending inserts for THIS account (deletes are id-based no-ops elsewhere).
        const relevant = ops.filter((o) =>
          (o.kind === 'insert' && o.table === 'account_transactions' && o.row.account_id === accountId) ||
          (o.kind === 'delete' && o.table === 'account_transactions')
        );
        const merged = materializeRows(rows, relevant, 'account_transactions');
        setTransactions(merged.map(rowToTxn).sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      });
    }
  }, [accountId, userId, storageMode, refreshKey]);

  const addTransaction = useCallback(async (
    type: 'deposit' | 'withdrawal',
    amount: number,
    note: string,
    date: string,
  ): Promise<AccountTransaction | null> => {
    if (!accountId || !userId) return null;

    if (storageMode === 'local') {
      const txn: AccountTransaction = {
        id: Crypto.randomUUID(),
        accountId,
        type,
        amount,
        note: note.trim(),
        date,
        createdAt: Date.now(),
      };
      const all = await localLoadAll(userId);
      await localSaveAll(userId, [txn, ...all]);
      setTransactions((prev) => [txn, ...prev]);
      return txn;
    } else {
      const { data } = await supabase.from('account_transactions').insert({
        account_id: accountId,
        user_id:    userId,
        type,
        amount,
        note:       note.trim(),
        date,
        created_at: Date.now(),
      }).select().single();
      if (data) {
        const txn = rowToTxn(data);
        setTransactions((prev) => [txn, ...prev]);
        return txn;
      }
      return null;
    }
  }, [accountId, userId, storageMode]);

  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    if (!userId) return;

    if (storageMode === 'local') {
      const all = await localLoadAll(userId);
      await localSaveAll(userId, all.filter((t) => t.id !== id));
    } else {
      await supabase.from('account_transactions').delete().eq('id', id);
    }
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, [userId, storageMode]);

  // Used when the whole account is being deleted
  const clearAllForAccount = useCallback(async (): Promise<void> => {
    if (!userId || !accountId || storageMode !== 'local') return;
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.filter((t) => t.accountId !== accountId));
    setTransactions([]);
  }, [userId, accountId, storageMode]);

  return { transactions, loading, addTransaction, deleteTransaction, clearAllForAccount, refresh };
}

// ── Standalone utils (used outside the hook context) ──────
export async function addAccountTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  data: Omit<AccountTransaction, 'id' | 'createdAt'>,
): Promise<string | null> {
  if (storageMode === 'local') {
    const id = Crypto.randomUUID();
    const txn: AccountTransaction = { ...data, id, createdAt: Date.now() };
    const all = await localLoadAll(userId);
    await localSaveAll(userId, [txn, ...all]);
    return id;
  } else {
    const { data: row } = await supabase.from('account_transactions').insert({
      account_id: data.accountId,
      user_id:    userId,
      type:       data.type,
      amount:     data.amount,
      note:       data.note,
      date:       data.date,
      created_at: Date.now(),
    }).select('id').single();
    return row?.id ?? null;
  }
}

export async function updateAccountTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  txnId: string,
  updates: Partial<Pick<AccountTransaction, 'amount' | 'note' | 'date'>>,
): Promise<void> {
  if (storageMode === 'local') {
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.map((t) => (t.id === txnId ? { ...t, ...updates } : t)));
  } else {
    await supabase.from('account_transactions').update(updates).eq('id', txnId);
  }
}

export async function deleteAccountTransactionDirect(
  userId: string,
  storageMode: StorageMode | null,
  txnId: string,
): Promise<void> {
  if (storageMode === 'local') {
    const all = await localLoadAll(userId);
    await localSaveAll(userId, all.filter((t) => t.id !== txnId));
  } else {
    await supabase.from('account_transactions').delete().eq('id', txnId);
  }
}
