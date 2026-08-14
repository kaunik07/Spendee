import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, materializeRows, pendingBalanceDeltas } from './syncQueue';
import { subscribeSync } from './syncBus';
import type { BankId, DocType } from '@/lib/statement/types';

export interface CreditCard {
  id: string;
  name: string;
  outstandingBalance: number;  // current amount owed on the card
  creditLimit: number | null;  // optional, for utilization display
  billingDay: number | null;   // payment due day-of-month (1–31), for reminders
  createdAt: number;
  // Which bank issued this card, so statement import knows which parser
  // profile to use without asking on every import. Set once, either when the
  // card is created or inline the first time it's used to import (see
  // app/import-statement.web.tsx). Cards created before this feature existed
  // have `bank: null` until then.
  bank: BankId | null;
  // Per-card override of the user's global default document type
  // (store/useImportPrefs.ts). Null means "use the global default".
  defaultDocType: DocType | null;
}

function rowToCard(row: any): CreditCard {
  return {
    id:                 row.id,
    name:               row.name,
    outstandingBalance: Number(row.outstanding_balance),
    creditLimit:        row.credit_limit != null ? Number(row.credit_limit) : null,
    billingDay:         row.billing_day != null ? Number(row.billing_day) : null,
    createdAt:          row.created_at,
    bank:               row.bank ?? null,
    defaultDocType:     row.default_doc_type ?? null,
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
    billingDay: number | null = null,
    bank: BankId | null = null,
  ) => {
    if (storageMode === 'local') {
      const entry: CreditCard = {
        id: Crypto.randomUUID(),
        name: name.trim(),
        outstandingBalance,
        creditLimit,
        billingDay,
        createdAt: Date.now(),
        bank,
        defaultDocType: null,
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
        billing_day:         billingDay,
        created_at:          Date.now(),
        bank,
      }).select().single();
      if (data) setCards((prev) => [...prev, rowToCard(data)]);
    }
  }, [userId, storageMode, cards, localKey]);

  // Set only the billing day (leaves balance/limit/name untouched).
  const setBillingDay = useCallback(async (id: string, billingDay: number | null) => {
    if (storageMode === 'local') {
      const updated = cards.map((c) => (c.id === id ? { ...c, billingDay } : c));
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      await supabase.from('credit_cards').update({ billing_day: billingDay }).eq('id', id);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, billingDay } : c)));
    }
  }, [storageMode, cards, localKey]);

  /**
   * Records which bank issued this card. Called from the import screen the
   * first time a `bank: null` card is used, so the question is asked at most
   * once per card (see app/import-statement.web.tsx).
   */
  const setCardBank = useCallback(async (id: string, bank: BankId) => {
    if (storageMode === 'local') {
      const updated = cards.map((c) => (c.id === id ? { ...c, bank } : c));
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      await supabase.from('credit_cards').update({ bank }).eq('id', id);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, bank } : c)));
    }
  }, [storageMode, cards, localKey]);

  /** Per-card override of the global default document type. `null` clears the override. */
  const setCardDefaultDocType = useCallback(async (id: string, defaultDocType: DocType | null) => {
    if (storageMode === 'local') {
      const updated = cards.map((c) => (c.id === id ? { ...c, defaultDocType } : c));
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setCards(updated);
    } else {
      await supabase.from('credit_cards').update({ default_doc_type: defaultDocType }).eq('id', id);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, defaultDocType } : c)));
    }
  }, [storageMode, cards, localKey]);

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

  return {
    cards, loading, refresh, addCard, updateCard, setBillingDay,
    setCardBank, setCardDefaultDocType, deleteCard, totalOutstanding,
  };
}
