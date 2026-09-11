import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface Topic {
  id: string;
  name: string;
  note: string;
  icon: string;
  targetAmount: number | null;
  dateStart: string | null;
  dateEnd: string | null;
  archived: boolean;
  createdAt: number;
}

function rowToTopic(row: any): Topic {
  return {
    id:           row.id,
    name:         row.name,
    note:         row.note ?? '',
    icon:         row.icon ?? '🗂️',
    targetAmount: row.target_amount !== null && row.target_amount !== undefined ? Number(row.target_amount) : null,
    dateStart:    row.date_start ?? null,
    dateEnd:      row.date_end ?? null,
    archived:     row.archived ?? false,
    createdAt:    row.created_at,
  };
}

function topicToRow(t: Topic, userId: string): Record<string, any> {
  return {
    id: t.id,
    user_id: userId,
    name: t.name,
    note: t.note,
    icon: t.icon,
    target_amount: t.targetAmount,
    date_start: t.dateStart,
    date_end: t.dateEnd,
    archived: t.archived,
    created_at: t.createdAt,
  };
}

export function useTopics(userId: string | null, storageMode: StorageMode | null) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_topics_${userId}`;
  const cacheKey = `@spendee_topics_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`topics_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setTopics([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setTopics(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('topics').select('*').order('created_at', { ascending: true }),
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
        setTopics(materializeRows(rows, ops, 'topics').map(rowToTopic));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const createTopic = useCallback(async (
    input: Omit<Topic, 'id' | 'createdAt' | 'archived'> & { archived?: boolean },
  ): Promise<Topic> => {
    const topic: Topic = { ...input, archived: input.archived ?? false, id: Crypto.randomUUID(), createdAt: Date.now() };

    if (storageMode === 'local') {
      const updated = [...topics, topic];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTopics(updated);
    } else {
      const row = topicToRow(topic, userId!);
      await enqueue(userId!, { id: opId(), kind: 'insert', table: 'topics', row });
      setTopics((prev) => [...prev, topic]);
      flushAndNotify(userId!);
    }
    return topic;
  }, [userId, storageMode, topics, localKey]);

  const updateTopic = useCallback(async (id: string, updates: Partial<Omit<Topic, 'id' | 'createdAt'>>) => {
    const existing = topics.find((t) => t.id === id);
    if (!existing) return;
    const updated: Topic = { ...existing, ...updates };

    if (storageMode === 'local') {
      const next = topics.map((t) => (t.id === id ? updated : t));
      await AsyncStorage.setItem(localKey, JSON.stringify(next));
      setTopics(next);
    } else {
      const row = topicToRow(updated, userId!);
      await enqueue(userId!, { id: opId(), kind: 'update', table: 'topics', rowId: id, row });
      setTopics((prev) => prev.map((t) => (t.id === id ? updated : t)));
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, topics, localKey]);

  const deleteTopic = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = topics.filter((t) => t.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTopics(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'topics', rowId: id });
      setTopics((prev) => prev.filter((t) => t.id !== id));
      flushAndNotify(userId!);
    }
  }, [storageMode, topics, localKey, userId]);

  return { topics, loading, refresh, createTopic, updateTopic, deleteTopic };
}
