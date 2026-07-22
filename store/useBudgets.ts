import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

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

function budgetToRow(b: Budget, userId: string): Record<string, any> {
  return { id: b.id, user_id: userId, category: b.category, monthly_limit: b.monthlyLimit, pinned: b.pinned, created_at: b.createdAt };
}

export function useBudgets(userId: string | null, storageMode: StorageMode | null) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_budgets_${userId}`;
  const cacheKey = `@spendee_budgets_cache_${userId}`;

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

  useEffect(() => subscribeSync(refresh), [refresh]);

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
      Promise.all([
        supabase.from('budgets').select('*').order('created_at', { ascending: true }),
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
        setBudgets(materializeRows(rows, ops, 'budgets').map(rowToBudget));
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
        updated = [...budgets, { id: Crypto.randomUUID(), category, monthlyLimit, pinned: isPinned, createdAt: Date.now() }];
      }
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setBudgets(updated);
    } else {
      const budget: Budget = existing
        ? { ...existing, monthlyLimit, pinned: isPinned }
        : { id: Crypto.randomUUID(), category, monthlyLimit, pinned: isPinned, createdAt: Date.now() };
      const row = budgetToRow(budget, userId!);
      await enqueue(userId!, existing
        ? { id: opId(), kind: 'update', table: 'budgets', rowId: budget.id, row }
        : { id: opId(), kind: 'insert', table: 'budgets', row });
      setBudgets((prev) => {
        const next = prev.filter((b) => b.category !== category);
        return [...next, budget].sort((a, b) => a.createdAt - b.createdAt);
      });
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, budgets, localKey]);

  const deleteBudget = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = budgets.filter((b) => b.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setBudgets(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'budgets', rowId: id });
      setBudgets((prev) => prev.filter((b) => b.id !== id));
      flushAndNotify(userId!);
    }
  }, [storageMode, budgets, localKey, userId]);

  return { budgets, loading, refresh, setBudget, deleteBudget };
}
