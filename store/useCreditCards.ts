import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, materializeRows, pendingBalanceDeltas } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface CreditCard {
  id: string;
  name: string;
  outstandingBalance: number;  // current amount owed on the card
  creditLimit: number | null;  // optional, for utilization display
  createdAt: number;
}

function rowToCard(row: any): CreditCard {
  return {
    id:                 row.id,
    name:               row.name,
    outstandingBalance: Number(row.outstanding_balance),
    creditLimit:        row.credit_limit != null ? Number(row.credit_limit) : null,
    createdAt:          row.created_at,
  };
}

export function useCreditCards(userId: string | null, storageMode: StorageMode | null) {
  const [cards, setCards]     = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_credit_cards_${userId}`;
  const cacheKey = `@spendee_credit_cards_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`credit_cards_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_cards', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  // Re-materialize when the sync queue changes (e.g. an expense's balance delta).
  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setCards([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setCards(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('credit_cards').select('*').order('created_at', { ascending: true }),
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
        const materialized = materializeRows(rows, ops, 'credit_cards');
        const deltas = pendingBalanceDeltas(ops, 'balanceCard');
        setCards(materialized.map((r) => {
          const c = rowToCard(r);
          return { ...c, outstandingBalance: c.outstandingBalance + (deltas[c.id] ?? 0) };
        }));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const addCard = useCallback(async (
    name: string,
    outstandingBalance: number,
    creditLimit: number | null,
  ) => {
    if (storageMode === 'local') {
      const entry: CreditCard = {
        id: Crypto.randomUUID(),
        name: name.trim(),
        outstandingBalance,
        creditLimit,
        createdAt: Date.now(),
      };
      const updated = [...cards, entry];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      const { data } = await supabase.from('credit_cards').insert({
        user_id:             userId,
        name:                name.trim(),
        outstanding_balance: outstandingBalance,
        credit_limit:        creditLimit,
        created_at:          Date.now(),
      }).select().single();
      if (data) setCards((prev) => [...prev, rowToCard(data)]);
    }
  }, [userId, storageMode, cards, localKey]);

  const updateCard = useCallback(async (
    id: string,
    name: string,
    outstandingBalance: number,
    creditLimit: number | null,
  ) => {
    if (storageMode === 'local') {
      const updated = cards.map((c) =>
        c.id === id ? { ...c, name: name.trim(), outstandingBalance, creditLimit } : c
      );
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      await supabase.from('credit_cards').update({
        name:                name.trim(),
        outstanding_balance: outstandingBalance,
        credit_limit:        creditLimit,
      }).eq('id', id);
      setCards((prev) =>
        prev.map((c) => c.id === id ? { ...c, name: name.trim(), outstandingBalance, creditLimit } : c)
      );
    }
  }, [storageMode, cards, localKey]);

  const deleteCard = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = cards.filter((c) => c.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      await supabase.from('credit_cards').delete().eq('id', id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    }
  }, [storageMode, cards, localKey]);

  const totalOutstanding = cards.reduce((sum, c) => sum + c.outstandingBalance, 0);

  return { cards, loading, refresh, addCard, updateCard, deleteCard, totalOutstanding };
}
