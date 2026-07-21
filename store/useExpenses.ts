import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { OutboxExpense, getOutbox, saveOutbox, enqueueExpense, removeFromOutbox } from './outbox';

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
  pending?: boolean;                     // online mode: added offline, not yet synced to cloud
}

// The DB row shape the outbox stores is identical to what we insert — so
// the same rowToExpense mapper turns an outbox item into a (pending) Expense.
function outboxToExpense(o: OutboxExpense): Expense {
  return { ...rowToExpense(o), pending: true };
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

export function useExpenses(userId: string | null, storageMode: StorageMode | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_expenses_${userId}`;

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
      // Fetch cloud rows and merge in any not-yet-synced offline adds so
      // pending expenses stay visible until they reach the server.
      Promise.all([
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        getOutbox(userId),
      ]).then(([res, outbox]) => {
        if (res.error) console.warn('[useExpenses] fetch error:', res.error.message);
        const serverRows = (res.data ?? []).map(rowToExpense);
        const serverIds  = new Set(serverRows.map((e) => e.id));
        const pendingRows = outbox.filter((o) => !serverIds.has(o.id)).map(outboxToExpense);
        setExpenses([...pendingRows, ...serverRows]);
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  // Push queued offline expenses to the cloud. Idempotent: a duplicate-key
  // error means the row already landed, so we treat it as synced. Any other
  // error (offline) stops the run — it retries on the next trigger.
  const flushOutbox = useCallback(async () => {
    if (storageMode !== 'online' || !userId) return;
    const items = await getOutbox(userId);
    if (items.length === 0) return;

    setSyncing(true);
    let changed = false;
    for (const it of items) {
      const { error } = await supabase.from('expenses').insert(it);
      if (!error || (error as any).code === '23505') {
        await removeFromOutbox(userId, it.id);
        changed = true;
      } else {
        break; // network/server error — keep the rest queued, retry later
      }
    }
    setSyncing(false);
    if (changed) refresh();
  }, [userId, storageMode, refresh]);

  // Flush on mount, whenever the app returns to the foreground, and on a
  // gentle interval — no native connectivity module needed.
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    flushOutbox();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') flushOutbox(); });
    const interval = setInterval(flushOutbox, 25000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [userId, storageMode, flushOutbox]);

  const addExpense = useCallback(
    async (item: Omit<Expense, 'id' | 'createdAt'>) => {
      if (storageMode === 'local') {
        const newExpense: Expense = { ...item, id: Date.now().toString(), createdAt: Date.now() };
        const updated = [newExpense, ...expenses];
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        // Online mode is offline-tolerant: write to the outbox with a
        // client-generated id, show it immediately, then try to sync.
        const row: OutboxExpense = {
          id:                    Crypto.randomUUID(),
          user_id:               userId!,
          name:                  item.name,
          amount:                item.amount,
          category:              item.category,
          note:                  item.note,
          date:                  item.date,
          created_at:            Date.now(),
          subcategory:           item.subcategory ?? null,
          details:               item.details ?? null,
          payment_type:          item.paymentType ?? null,
          payment_source_id:     item.paymentSourceId ?? null,
          linked_transaction_id: item.linkedTransactionId ?? null,
        };
        await enqueueExpense(userId!, row);
        setExpenses((prev) => [outboxToExpense(row), ...prev]);
        flushOutbox(); // fire-and-forget; stays queued if offline
      }
    },
    [userId, storageMode, expenses, localKey, flushOutbox]
  );

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
      if (storageMode === 'local') {
        const updated = expenses.map((e) => (e.id === id ? { ...e, ...updates } : e));
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        // If the expense is still queued offline, edit the queued payload
        // instead of updating a row the server doesn't have yet.
        const outbox = await getOutbox(userId!);
        const idx = outbox.findIndex((o) => o.id === id);
        if (idx !== -1) {
          const o = outbox[idx];
          if (updates.name            !== undefined) o.name                  = updates.name;
          if (updates.amount          !== undefined) o.amount                = updates.amount;
          if (updates.category        !== undefined) o.category              = updates.category;
          if (updates.note            !== undefined) o.note                  = updates.note;
          if (updates.date            !== undefined) o.date                  = updates.date;
          if (updates.subcategory     !== undefined) o.subcategory           = updates.subcategory ?? null;
          if (updates.details         !== undefined) o.details               = updates.details ?? null;
          if (updates.paymentType     !== undefined) o.payment_type          = updates.paymentType;
          if (updates.paymentSourceId !== undefined) o.payment_source_id     = updates.paymentSourceId;
          if (updates.linkedTransactionId !== undefined) o.linked_transaction_id = updates.linkedTransactionId;
          await saveOutbox(userId!, outbox);
          setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
          return;
        }
        const dbUpdates: Record<string, any> = {};
        if (updates.name              !== undefined) dbUpdates.name               = updates.name;
        if (updates.amount            !== undefined) dbUpdates.amount             = updates.amount;
        if (updates.category          !== undefined) dbUpdates.category           = updates.category;
        if (updates.note              !== undefined) dbUpdates.note               = updates.note;
        if (updates.date              !== undefined) dbUpdates.date               = updates.date;
        if (updates.subcategory       !== undefined) dbUpdates.subcategory        = updates.subcategory ?? null;
        if (updates.details           !== undefined) dbUpdates.details            = updates.details ?? null;
        if (updates.paymentType       !== undefined) dbUpdates.payment_type       = updates.paymentType;
        if (updates.paymentSourceId   !== undefined) dbUpdates.payment_source_id  = updates.paymentSourceId;
        if (updates.linkedTransactionId !== undefined) dbUpdates.linked_transaction_id = updates.linkedTransactionId;
        await supabase.from('expenses').update(dbUpdates).eq('id', id);
        setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      }
    },
    [storageMode, expenses, localKey, userId]
  );

  const deleteExpense = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = expenses.filter((e) => e.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setExpenses(updated);
    } else {
      // A still-queued offline add is deleted by dropping it from the outbox
      // (there's no server row to delete yet).
      const outbox = await getOutbox(userId!);
      if (outbox.some((o) => o.id === id)) {
        await removeFromOutbox(userId!, id);
      } else {
        await supabase.from('expenses').delete().eq('id', id);
      }
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  }, [storageMode, expenses, localKey, userId]);

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
    expenses, loading, syncing, pendingCount, refresh, flushOutbox,
    addExpense, updateExpense, deleteExpense,
    currentMonthTotal, expensesByDate, expensesForDate, monthlyTotals,
  };
}
