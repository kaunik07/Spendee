import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import {
  SyncOp, getQueue, enqueue, flushQueue,
  materializeRows, pendingRowIds,
} from './syncQueue';
import { subscribeSync, notifySync } from './syncBus';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: number;
  subcategory?: string | null;              // subcategory id from constants/subcategories
  details?: Record<string, any> | null;     // extra per-subcategory info (kept for later stages)
  // Optional link to the payment source used for this expense
  paymentType: 'bank_account' | 'credit_card' | null;
  paymentSourceId: string | null;       // account id or card id
  linkedTransactionId: string | null;   // transaction created in that account/card
  pending?: boolean;                     // online mode: queued offline, not yet synced
}

function rowToExpense(row: any): Expense {
  return {
    id:                  row.id,
    name:                row.name,
    amount:              Number(row.amount),
    category:            row.category,
    note:                row.note ?? '',
    date:                row.date,
    createdAt:           row.created_at,
    subcategory:         row.subcategory ?? null,
    details:             row.details ?? null,
    paymentType:         row.payment_type ?? null,
    paymentSourceId:     row.payment_source_id ?? null,
    linkedTransactionId: row.linked_transaction_id ?? null,
  };
}

// Full DB row for an expense (used for queued insert/update ops).
export function expenseToRow(e: Expense, userId: string): Record<string, any> {
  return {
    id:                    e.id,
    user_id:               userId,
    name:                  e.name,
    amount:                e.amount,
    category:              e.category,
    note:                  e.note,
    date:                  e.date,
    created_at:            e.createdAt,
    subcategory:           e.subcategory ?? null,
    details:               e.details ?? null,
    payment_type:          e.paymentType ?? null,
    payment_source_id:     e.paymentSourceId ?? null,
    linked_transaction_id: e.linkedTransactionId ?? null,
  };
}

const opId = () => Crypto.randomUUID();

export function useExpenses(userId: string | null, storageMode: StorageMode | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_expenses_${userId}`;
  const cacheKey = `@spendee_expenses_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`expenses_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  // Re-materialize when any other store flushes/changes the queue.
  useEffect(() => subscribeSync(refresh), [refresh]);

  // Clear state only when user/mode changes, not on every refresh
  useEffect(() => { setExpenses([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setExpenses(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      // Fetch cloud rows (or fall back to the offline cache), then overlay the
      // pending sync-queue ops so offline adds/edits/deletes are reflected.
      Promise.all([
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        getQueue(userId),
      ]).then(async ([res, ops]) => {
        let rawRows: any[];
        if (res.error) {
          const cached = await AsyncStorage.getItem(cacheKey);
          rawRows = cached ? JSON.parse(cached) : [];
        } else {
          rawRows = res.data ?? [];
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rawRows));
        }
        const merged  = materializeRows(rawRows, ops, 'expenses');
        const pending = pendingRowIds(ops, 'expenses');
        setExpenses(merged.map((r) => ({ ...rowToExpense(r), pending: pending.has(r.id) })));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  // Drain the sync queue. Idempotent replay; stops on the first failure
  // (offline) and retries on the next trigger. Notifies other stores so their
  // balances/lists re-materialize too.
  const flush = useCallback(async () => {
    if (storageMode !== 'online' || !userId) return;
    const q = await getQueue(userId);
    if (q.length === 0) return;
    setSyncing(true);
    await flushQueue(userId);
    setSyncing(false);
    notifySync();
  }, [userId, storageMode]);

  // Flush on mount, on foreground, and on a gentle interval.
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    flush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') flush(); });
    const interval = setInterval(flush, 25000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [userId, storageMode, flush]);

  // `bundle` carries the linked payment-source ops (transaction insert +
  // balance delta) so an offline payment-linked expense syncs as one unit.
  const addExpense = useCallback(
    async (item: Omit<Expense, 'id' | 'createdAt'>, bundle: SyncOp[] = []) => {
      if (storageMode === 'local') {
        const newExpense: Expense = { ...item, id: Crypto.randomUUID(), createdAt: Date.now() };
        const updated = [newExpense, ...expenses];
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        const expense: Expense = { ...item, id: Crypto.randomUUID(), createdAt: Date.now() };
        const row = expenseToRow(expense, userId!);
        await enqueue(userId!, { id: opId(), kind: 'insert', table: 'expenses', row }, ...bundle);
        setExpenses((prev) => [{ ...expense, pending: true }, ...prev]);
        if (bundle.length > 0) notifySync(); // let accounts/cards reflect the balance delta
        flush();
      }
    },
    [userId, storageMode, expenses, localKey, flush]
  );

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>, bundle: SyncOp[] = []) => {
      if (storageMode === 'local') {
        const updated = expenses.map((e) => (e.id === id ? { ...e, ...updates } : e));
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        const current = expenses.find((e) => e.id === id);
        if (!current) return;
        const merged = { ...current, ...updates };
        const row = expenseToRow(merged, userId!);
        // Full-row overwrite = last-write-wins across devices.
        await enqueue(userId!, { id: opId(), kind: 'update', table: 'expenses', rowId: id, row }, ...bundle);
        setExpenses((prev) => prev.map((e) => (e.id === id ? merged : e)));
        if (bundle.length > 0) notifySync();
        flush();
      }
    },
    [userId, storageMode, expenses, localKey, flush]
  );

  const deleteExpense = useCallback(async (id: string, bundle: SyncOp[] = []) => {
    if (storageMode === 'local') {
      const updated = expenses.filter((e) => e.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setExpenses(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'expenses', rowId: id }, ...bundle);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      if (bundle.length > 0) notifySync();
      flush();
    }
  }, [storageMode, expenses, localKey, userId, flush]);

  const currentMonthTotal = useCallback(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const expensesByDate = useCallback(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => { map[e.date] = (map[e.date] ?? 0) + e.amount; });
    return map;
  }, [expenses]);

  const expensesForDate = useCallback(
    (date: string) => expenses.filter((e) => e.date === date),
    [expenses]
  );

  const monthlyTotals = useCallback((year: number) => {
    const map: Record<string, number> = {};
    expenses.filter((e) => e.date.startsWith(String(year))).forEach((e) => {
      const month = e.date.substring(0, 7);
      map[month] = (map[month] ?? 0) + e.amount;
    });
    return map;
  }, [expenses]);

  const pendingCount = expenses.reduce((n, e) => n + (e.pending ? 1 : 0), 0);

  return {
    expenses, loading, syncing, pendingCount, refresh, flush,
    addExpense, updateExpense, deleteExpense,
    currentMonthTotal, expensesByDate, expensesForDate, monthlyTotals,
  };
}
