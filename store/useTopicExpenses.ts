import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface TopicExpenseMembership {
  id: string;
  topicId: string;
  expenseId: string;
  createdAt: number;
}

function rowToMembership(row: any): TopicExpenseMembership {
  return {
    id:        row.id,
    topicId:   row.topic_id,
    expenseId: row.expense_id,
    createdAt: row.created_at,
  };
}

// Fetches the WHOLE table for the user (a few rows per expense at most —
// small), not scoped to one topic. This is deliberate: one subscription
// serves both the topic detail page (filter client-side by topicId) and the
// Expenses-list / Add-Expenses picker (filter client-side by expenseId, for
// the "already in N topics" tag) without two separate fetches or two
// separate realtime channels.
export function useTopicExpenses(userId: string | null, storageMode: StorageMode | null) {
  const [memberships, setMemberships] = useState<TopicExpenseMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_topic_expenses_${userId}`;
  const cacheKey = `@spendee_topic_expenses_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`topic_expenses_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_expenses', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setMemberships([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setMemberships(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('topic_expenses').select('*'),
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
        setMemberships(materializeRows(rows, ops, 'topic_expenses').map(rowToMembership));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const addExpensesToTopic = useCallback(async (topicId: string, expenseIds: string[]) => {
    if (expenseIds.length === 0) return;
    const now = Date.now();
    const newRows: TopicExpenseMembership[] = expenseIds.map((expenseId, i) => ({
      id: Crypto.randomUUID(),
      topicId,
      expenseId,
      createdAt: now + i,
    }));

    if (storageMode === 'local') {
      const updated = [...memberships, ...newRows];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setMemberships(updated);
    } else {
      const ops = newRows.map((m) => ({
        id: opId(),
        kind: 'insert' as const,
        table: 'topic_expenses',
        row: { id: m.id, user_id: userId!, topic_id: m.topicId, expense_id: m.expenseId, created_at: m.createdAt },
      }));
      await enqueue(userId!, ...ops);
      setMemberships((prev) => [...prev, ...newRows]);
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, memberships, localKey]);

  const removeExpenseFromTopic = useCallback(async (topicId: string, expenseId: string) => {
    const row = memberships.find((m) => m.topicId === topicId && m.expenseId === expenseId);
    if (!row) return;

    if (storageMode === 'local') {
      const updated = memberships.filter((m) => m.id !== row.id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setMemberships(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'topic_expenses', rowId: row.id });
      setMemberships((prev) => prev.filter((m) => m.id !== row.id));
      flushAndNotify(userId!);
    }
  }, [storageMode, memberships, localKey, userId]);

  return { memberships, loading, refresh, addExpensesToTopic, removeExpenseFromTopic };
}
