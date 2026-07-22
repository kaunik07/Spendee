import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface Saving {
  id: string;
  name: string;
  amount: number;
  note: string;
  date: string;
  createdAt: number;
}

function rowToSaving(row: any): Saving {
  return {
    id: row.id, name: row.name, amount: Number(row.amount),
    note: row.note ?? '', date: row.date, createdAt: row.created_at,
  };
}

function savingToRow(s: Saving, userId: string): Record<string, any> {
  return { id: s.id, user_id: userId, name: s.name, amount: s.amount, note: s.note, date: s.date, created_at: s.createdAt };
}

export function useSavings(userId: string | null, storageMode: StorageMode | null) {
  const [savings, setSavings] = useState<Saving[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_savings_${userId}`;
  const cacheKey = `@spendee_savings_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`savings_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setSavings([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setSavings(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('savings').select('*').order('created_at', { ascending: false }),
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
        setSavings(materializeRows(rows, ops, 'savings').map(rowToSaving));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const addSaving = useCallback(async (item: Omit<Saving, 'id' | 'createdAt'>) => {
    if (storageMode === 'local') {
      const entry: Saving = { ...item, id: Crypto.randomUUID(), createdAt: Date.now() };
      const updated = [entry, ...savings];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setSavings(updated);
    } else {
      const entry: Saving = { ...item, id: Crypto.randomUUID(), createdAt: Date.now() };
      await enqueue(userId!, { id: opId(), kind: 'insert', table: 'savings', row: savingToRow(entry, userId!) });
      setSavings((prev) => [entry, ...prev]);
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, savings, localKey]);

  const deleteSaving = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = savings.filter((s) => s.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setSavings(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'savings', rowId: id });
      setSavings((prev) => prev.filter((s) => s.id !== id));
      flushAndNotify(userId!);
    }
  }, [storageMode, savings, localKey, userId]);

  const resetSavings = useCallback(async () => {
    if (storageMode === 'local') {
      await AsyncStorage.setItem(localKey, JSON.stringify([]));
      setSavings([]);
    } else {
      // Queue an individual delete for each entry so a reset survives offline too.
      await enqueue(userId!, ...savings.map((s) => ({ id: opId(), kind: 'delete' as const, table: 'savings', rowId: s.id })));
      setSavings([]);
      flushAndNotify(userId!);
    }
  }, [storageMode, localKey, savings, userId]);

  const totalSaved = useCallback(
    () => savings.reduce((sum, s) => sum + s.amount, 0),
    [savings]
  );

  return { savings, loading, refresh, addSaving, deleteSaving, resetSavings, totalSaved };
}
