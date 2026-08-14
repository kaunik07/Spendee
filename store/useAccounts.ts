import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, materializeRows, pendingBalanceDeltas } from './syncQueue';
import { subscribeSync } from './syncBus';
import type { BankId, DocType } from '@/lib/statement/types';

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  createdAt: number;
  // See CreditCard.bank in store/useCreditCards.ts — same idea, statement
  // import needs to know which parser profile to use.
  bank: BankId | null;
  defaultDocType: DocType | null;
}

function rowToAccount(row: any): BankAccount {
  return {
    id:             row.id,
    name:           row.name,
    balance:        Number(row.balance),
    createdAt:      row.created_at,
    bank:           row.bank ?? null,
    defaultDocType: row.default_doc_type ?? null,
  };
}

export function useAccounts(userId: string | null, storageMode: StorageMode | null) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_accounts_${userId}`;
  const cacheKey = `@spendee_accounts_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`bank_accounts_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  // Re-materialize when the sync queue changes (e.g. an expense's balance delta).
  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setAccounts([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setAccounts(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      // Fetch (or use the offline cache), then overlay any pending balance
      // deltas from the sync queue so offline deductions show and converge.
      Promise.all([
        supabase.from('bank_accounts').select('*').order('created_at', { ascending: true }),
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
        const materialized = materializeRows(rows, ops, 'bank_accounts');
        const deltas = pendingBalanceDeltas(ops, 'balanceAccount');
        setAccounts(materialized.map((r) => {
          const a = rowToAccount(r);
          return { ...a, balance: a.balance + (deltas[a.id] ?? 0) };
        }));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const addAccount = useCallback(async (name: string, balance: number, bank: BankId | null = null) => {
    if (storageMode === 'local') {
      const entry: BankAccount = {
        id: Crypto.randomUUID(), name: name.trim(), balance, createdAt: Date.now(),
        bank, defaultDocType: null,
      };
      const updated = [...accounts, entry];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      const { data } = await supabase.from('bank_accounts').insert({
        user_id: userId, name: name.trim(), balance, created_at: Date.now(), bank,
      }).select().single();
      if (data) setAccounts((prev) => [...prev, rowToAccount(data)]);
    }
  }, [userId, storageMode, accounts, localKey]);

  /** See setCardBank in store/useCreditCards.ts. */
  const setAccountBank = useCallback(async (id: string, bank: BankId) => {
    if (storageMode === 'local') {
      const updated = accounts.map((a) => (a.id === id ? { ...a, bank } : a));
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      await supabase.from('bank_accounts').update({ bank }).eq('id', id);
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, bank } : a)));
    }
  }, [storageMode, accounts, localKey]);

  const setAccountDefaultDocType = useCallback(async (id: string, defaultDocType: DocType | null) => {
    if (storageMode === 'local') {
      const updated = accounts.map((a) => (a.id === id ? { ...a, defaultDocType } : a));
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      await supabase.from('bank_accounts').update({ default_doc_type: defaultDocType }).eq('id', id);
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, defaultDocType } : a)));
    }
  }, [storageMode, accounts, localKey]);

  const updateAccount = useCallback(async (id: string, name: string, balance: number) => {
    if (storageMode === 'local') {
      const updated = accounts.map((a) => a.id === id ? { ...a, name: name.trim(), balance } : a);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      await supabase.from('bank_accounts').update({ name: name.trim(), balance }).eq('id', id);
      setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, name: name.trim(), balance } : a));
    }
  }, [storageMode, accounts, localKey]);

  const deleteAccount = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = accounts.filter((a) => a.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      await supabase.from('bank_accounts').delete().eq('id', id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    }
  }, [storageMode, accounts, localKey]);

  const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

  return {
    accounts, loading, refresh, addAccount, updateAccount,
    setAccountBank, setAccountDefaultDocType, deleteAccount, netWorth,
  };
}
