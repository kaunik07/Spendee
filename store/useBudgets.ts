import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export interface Budget {
  id: string;
  category: string;      // category id from constants/theme
  monthlyLimit: number;
  pinned: boolean;       // pinned budgets appear on the Home tab
  createdAt: number;
}

function rowToBudget(row: any): Budget {
  return {
    id:           row.id,
    category:     row.category,
    monthlyLimit: Number(row.monthly_limit),
    pinned:       row.pinned ?? false,
    createdAt:    row.created_at,
  };
}

export function useBudgets(userId: string | null, storageMode: StorageMode | null) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_budgets_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`budgets_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => { setBudgets([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setBudgets(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      supabase.from('budgets').select('*').order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) console.warn('[useBudgets] fetch error:', error.message);
          setBudgets((data ?? []).map(rowToBudget));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  // Create or update the budget for a category (one budget per category)
  const setBudget = useCallback(async (category: string, monthlyLimit: number, pinned?: boolean) => {
    const existing = budgets.find((b) => b.category === category);
    const isPinned = pinned ?? existing?.pinned ?? false;

    if (storageMode === 'local') {
      let updated: Budget[];
      if (existing) {
        updated = budgets.map((b) => (b.category === category ? { ...b, monthlyLimit, pinned: isPinned } : b));
      } else {
        updated = [...budgets, { id: Date.now().toString(), category, monthlyLimit, pinned: isPinned, createdAt: Date.now() }];
      }
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setBudgets(updated);
    } else {
      const { data, error } = await supabase.from('budgets').upsert(
        { user_id: userId, category, monthly_limit: monthlyLimit, pinned: isPinned, created_at: existing?.createdAt ?? Date.now() },
        { onConflict: 'user_id,category' }
      ).select().single();
      if (error) console.warn('[useBudgets] upsert error:', error.message);
      if (data) {
        setBudgets((prev) => {
          const next = prev.filter((b) => b.category !== category);
          return [...next, rowToBudget(data)].sort((a, b) => a.createdAt - b.createdAt);
        });
      }
    }
  }, [userId, storageMode, budgets, localKey]);

  const deleteBudget = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = budgets.filter((b) => b.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setBudgets(updated);
    } else {
      await supabase.from('budgets').delete().eq('id', id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    }
  }, [storageMode, budgets, localKey]);

  return { budgets, loading, refresh, setBudget, deleteBudget };
}
