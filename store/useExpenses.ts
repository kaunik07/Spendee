import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: number;
  tripId?: string;
  // Optional link to the payment source used for this expense
  paymentType: 'bank_account' | 'credit_card' | null;
  paymentSourceId: string | null;       // account id or card id
  linkedTransactionId: string | null;   // transaction created in that account/card
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
    tripId:              row.trip_id ?? undefined,
    paymentType:         row.payment_type ?? null,
    paymentSourceId:     row.payment_source_id ?? null,
    linkedTransactionId: row.linked_transaction_id ?? null,
  };
}

export function useExpenses(userId: string | null, storageMode: StorageMode | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading]   = useState(true);
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
      supabase.from('expenses').select('*').order('created_at', { ascending: false })
        .then(({ data }) => {
          setExpenses((data ?? []).map(rowToExpense));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  const addExpense = useCallback(
    async (item: Omit<Expense, 'id' | 'createdAt'>) => {
      if (storageMode === 'local') {
        const newExpense: Expense = { ...item, id: Date.now().toString(), createdAt: Date.now() };
        const updated = [newExpense, ...expenses];
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        const { data } = await supabase.from('expenses').insert({
          user_id:              userId,
          name:                 item.name,
          amount:               item.amount,
          category:             item.category,
          note:                 item.note,
          date:                 item.date,
          created_at:           Date.now(),
          trip_id:              item.tripId ?? null,
          payment_type:         item.paymentType ?? null,
          payment_source_id:    item.paymentSourceId ?? null,
          linked_transaction_id: item.linkedTransactionId ?? null,
        }).select().single();
        if (data) setExpenses((prev) => [rowToExpense(data), ...prev]);
      }
    },
    [userId, storageMode, expenses, localKey]
  );

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
      if (storageMode === 'local') {
        const updated = expenses.map((e) => (e.id === id ? { ...e, ...updates } : e));
        await AsyncStorage.setItem(localKey, JSON.stringify(updated));
        setExpenses(updated);
      } else {
        const dbUpdates: Record<string, any> = {};
        if (updates.name              !== undefined) dbUpdates.name               = updates.name;
        if (updates.amount            !== undefined) dbUpdates.amount             = updates.amount;
        if (updates.category          !== undefined) dbUpdates.category           = updates.category;
        if (updates.note              !== undefined) dbUpdates.note               = updates.note;
        if (updates.date              !== undefined) dbUpdates.date               = updates.date;
        if (updates.tripId            !== undefined) dbUpdates.trip_id            = updates.tripId ?? null;
        if (updates.paymentType       !== undefined) dbUpdates.payment_type       = updates.paymentType;
        if (updates.paymentSourceId   !== undefined) dbUpdates.payment_source_id  = updates.paymentSourceId;
        if (updates.linkedTransactionId !== undefined) dbUpdates.linked_transaction_id = updates.linkedTransactionId;
        await supabase.from('expenses').update(dbUpdates).eq('id', id);
        setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      }
    },
    [storageMode, expenses, localKey]
  );

  const deleteExpense = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = expenses.filter((e) => e.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setExpenses(updated);
    } else {
      await supabase.from('expenses').delete().eq('id', id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  }, [storageMode, expenses, localKey]);

  const deleteExpensesByTripId = useCallback(async (tripId: string) => {
    if (storageMode === 'local') {
      const updated = expenses.filter((e) => e.tripId !== tripId);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setExpenses(updated);
    } else {
      await supabase.from('expenses').delete().eq('trip_id', tripId);
      setExpenses((prev) => prev.filter((e) => e.tripId !== tripId));
    }
  }, [storageMode, expenses, localKey]);

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

  return {
    expenses, loading, refresh, addExpense, updateExpense, deleteExpense, deleteExpensesByTripId,
    currentMonthTotal, expensesByDate, expensesForDate, monthlyTotals,
  };
}
