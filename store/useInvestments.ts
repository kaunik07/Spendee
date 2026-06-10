import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export type InvestmentType = 'stocks' | '401k' | 'mutual_funds';
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  nextDueDate: string | null; // YYYY-MM-DD — next auto-generate date
  createdAt: number;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function computeNextDueDate(fromDate: string, freq: RecurringFrequency): string {
  const d = new Date(fromDate + 'T00:00:00');
  if (freq === 'weekly')   d.setDate(d.getDate() + 7);
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
  else                     d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function rowToInvestment(row: any): Investment {
  return {
    id:                 row.id,
    name:               row.name,
    type:               row.type,
    amount:             Number(row.amount),
    date:               row.date,
    note:               row.note ?? '',
    isRecurring:        row.is_recurring ?? false,
    recurringFrequency: row.recurring_frequency ?? null,
    nextDueDate:        row.next_due_date ?? null,
    createdAt:          row.created_at,
  };
}

export function useInvestments(userId: string | null, storageMode: StorageMode | null) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);

  // prevent double-processing recurring per session
  const processedRef     = useRef(false);
  // keep a stable ref for use inside the recurring effect
  const investmentsRef   = useRef<Investment[]>([]);
  investmentsRef.current = investments;

  const localKey = `@spendee_investments_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // ── Realtime (online) ──────────────────────────────────
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`investments_${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'investments',
        filter: `user_id=eq.${userId}`,
      }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  // ── Reset on user/mode change ──────────────────────────
  useEffect(() => {
    setInvestments([]);
    processedRef.current = false;
  }, [userId, storageMode]);

  // ── Load ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);
    processedRef.current = false;

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        setInvestments(raw ? JSON.parse(raw) : []);
        setLoading(false);
      });
    } else {
      supabase
        .from('investments')
        .select('*')
        .order('date', { ascending: false })
        .then(({ data }) => {
          setInvestments((data ?? []).map(rowToInvestment));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  // ── Auto-process recurring investments on open ─────────
  useEffect(() => {
    if (loading || processedRef.current || !userId || !storageMode) return;
    processedRef.current = true;

    const today = todayStr();
    const current = investmentsRef.current;
    const due = current.filter(
      (inv) => inv.isRecurring && inv.nextDueDate && inv.nextDueDate <= today
    );
    if (due.length === 0) return;

    (async () => {
      if (storageMode === 'local') {
        const newEntries: Investment[] = due.map((inv) => ({
          id:                 `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name:               inv.name,
          type:               inv.type,
          amount:             inv.amount,
          date:               inv.nextDueDate!,
          note:               inv.note,
          isRecurring:        true,
          recurringFrequency: inv.recurringFrequency,
          nextDueDate:        computeNextDueDate(inv.nextDueDate!, inv.recurringFrequency!),
          createdAt:          Date.now(),
        }));
        const dueIds = new Set(due.map((d) => d.id));
        const cleared = current.map((inv) =>
          dueIds.has(inv.id) ? { ...inv, nextDueDate: null } : inv
        );
        const final = [...newEntries, ...cleared].sort((a, b) => b.date.localeCompare(a.date));
        await AsyncStorage.setItem(localKey, JSON.stringify(final));
        setInvestments(final);
      } else {
        for (const inv of due) {
          await supabase.from('investments').insert({
            user_id:             userId,
            name:                inv.name,
            type:                inv.type,
            amount:              inv.amount,
            date:                inv.nextDueDate,
            note:                inv.note,
            is_recurring:        true,
            recurring_frequency: inv.recurringFrequency,
            next_due_date:       computeNextDueDate(inv.nextDueDate!, inv.recurringFrequency!),
            created_at:          Date.now(),
          });
          await supabase
            .from('investments')
            .update({ next_due_date: null })
            .eq('id', inv.id)
            .eq('user_id', userId);
        }
        refresh();
      }
    })();
  }, [loading, userId, storageMode]);

  // ── CRUD ───────────────────────────────────────────────
  const addInvestment = useCallback(async (item: Omit<Investment, 'id' | 'createdAt'>) => {
    if (storageMode === 'local') {
      const entry: Investment = {
        ...item,
        id:        `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
      };
      const updated = [entry, ...investmentsRef.current].sort(
        (a, b) => b.date.localeCompare(a.date)
      );
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setInvestments(updated);
    } else {
      const { data } = await supabase
        .from('investments')
        .insert({
          user_id:             userId,
          name:                item.name,
          type:                item.type,
          amount:              item.amount,
          date:                item.date,
          note:                item.note,
          is_recurring:        item.isRecurring,
          recurring_frequency: item.recurringFrequency,
          next_due_date:       item.nextDueDate,
          created_at:          Date.now(),
        })
        .select()
        .single();
      if (data) {
        setInvestments((prev) =>
          [rowToInvestment(data), ...prev].sort((a, b) => b.date.localeCompare(a.date))
        );
      }
    }
  }, [userId, storageMode, localKey]);

  const deleteInvestment = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = investmentsRef.current.filter((i) => i.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setInvestments(updated);
    } else {
      await supabase.from('investments').delete().eq('id', id);
      setInvestments((prev) => prev.filter((i) => i.id !== id));
    }
  }, [storageMode, localKey]);

  // ── Derived data ───────────────────────────────────────
  const totalInvested = useCallback(
    () => investments.reduce((sum, i) => sum + i.amount, 0),
    [investments]
  );

  const totalByType = useCallback(
    () =>
      investments.reduce((acc, inv) => {
        acc[inv.type] = (acc[inv.type] ?? 0) + inv.amount;
        return acc;
      }, {} as Partial<Record<InvestmentType, number>>),
    [investments]
  );

  return {
    investments,
    loading,
    refresh,
    addInvestment,
    deleteInvestment,
    totalInvested,
    totalByType,
  };
}
