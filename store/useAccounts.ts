import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  createdAt: number;
}

function rowToAccount(row: any): BankAccount {
  return {
    id:        row.id,
    name:      row.name,
    balance:   Number(row.balance),
    createdAt: row.created_at,
  };
}

export function useAccounts(userId: string | null, storageMode: StorageMode | null) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_accounts_${userId}`;

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
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: true })
        .then(({ data }) => {
          setAccounts((data ?? []).map(rowToAccount));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  const addAccount = useCallback(async (name: string, balance: number) => {
    if (storageMode === 'local') {
      const entry: BankAccount = { id: Date.now().toString(), name: name.trim(), balance, createdAt: Date.now() };
      const updated = [...accounts, entry];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setAccounts(updated);
    } else {
      const { data } = await supabase.from('bank_accounts').insert({
        user_id: userId, name: name.trim(), balance, created_at: Date.now(),
      }).select().single();
      if (data) setAccounts((prev) => [...prev, rowToAccount(data)]);
    }
  }, [userId, storageMode, accounts, localKey]);

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

  return { accounts, loading, refresh, addAccount, updateAccount, deleteAccount, netWorth };
}
