import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

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

export function useSavings(userId: string | null, storageMode: StorageMode | null) {
  const [savings, setSavings] = useState<Saving[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_savings_${userId}`;

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
      supabase.from('savings').select('*').order('created_at', { ascending: false })
        .then(({ data }) => {
          setSavings((data ?? []).map(rowToSaving));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  const addSaving = useCallback(async (item: Omit<Saving, 'id' | 'createdAt'>) => {
    if (storageMode === 'local') {
      const entry: Saving = { ...item, id: Date.now().toString(), createdAt: Date.now() };
      const updated = [entry, ...savings];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setSavings(updated);
    } else {
      const { data } = await supabase.from('savings').insert({
        user_id: userId, name: item.name, amount: item.amount,
        note: item.note, date: item.date, created_at: Date.now(),
      }).select().single();
      if (data) setSavings((prev) => [rowToSaving(data), ...prev]);
    }
  }, [userId, storageMode, savings, localKey]);

  const deleteSaving = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = savings.filter((s) => s.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setSavings(updated);
    } else {
      await supabase.from('savings').delete().eq('id', id);
      setSavings((prev) => prev.filter((s) => s.id !== id));
    }
  }, [storageMode, savings, localKey]);

  const resetSavings = useCallback(async () => {
    if (storageMode === 'local') {
      await AsyncStorage.setItem(localKey, JSON.stringify([]));
      setSavings([]);
    } else {
      await supabase.from('savings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setSavings([]);
    }
  }, [storageMode, localKey]);

  const totalSaved = useCallback(
    () => savings.reduce((sum, s) => sum + s.amount, 0),
    [savings]
  );

  return { savings, loading, refresh, addSaving, deleteSaving, resetSavings, totalSaved };
}
