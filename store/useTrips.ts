import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';

export interface Trip {
  id: string;
  name: string;
  currency: string;       // e.g. 'USD', 'INR'
  conversionRate: number; // how many units of currency = $1 (USD trips: 1)
  createdAt: number;
}

function rowToTrip(row: any): Trip {
  return {
    id:             row.id,
    name:           row.name,
    currency:       row.currency ?? 'USD',
    conversionRate: Number(row.conversion_rate ?? 1),
    createdAt:      row.created_at,
  };
}

export function useTrips(userId: string | null, storageMode: StorageMode | null) {
  const [trips, setTrips]     = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_trips_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Realtime sync (online mode only)
  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`trips_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => { setTrips([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setTrips(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      supabase.from('trips').select('*').order('created_at', { ascending: false })
        .then(({ data }) => {
          setTrips((data ?? []).map(rowToTrip));
          setLoading(false);
        });
    }
  }, [userId, storageMode, refreshKey]);

  const addTrip = useCallback(async (
    name: string,
    currency: string = 'USD',
    conversionRate: number = 1,
  ): Promise<Trip> => {
    if (storageMode === 'local') {
      const newTrip: Trip = { id: Date.now().toString(), name: name.trim(), currency, conversionRate, createdAt: Date.now() };
      const updated = [newTrip, ...trips];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTrips(updated);
      return newTrip;
    } else {
      const { data } = await supabase.from('trips')
        .insert({ user_id: userId, name: name.trim(), currency, conversion_rate: conversionRate, created_at: Date.now() })
        .select().single();
      const newTrip = rowToTrip(data);
      setTrips((prev) => [newTrip, ...prev]);
      return newTrip;
    }
  }, [userId, storageMode, trips, localKey]);

  const updateTrip = useCallback(async (
    id: string,
    updates: { name?: string; currency?: string; conversionRate?: number },
  ) => {
    if (storageMode === 'local') {
      const updated = trips.map((t) => t.id === id ? { ...t, ...updates } : t);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTrips(updated);
    } else {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined)           dbUpdates.name            = updates.name.trim();
      if (updates.currency !== undefined)       dbUpdates.currency        = updates.currency;
      if (updates.conversionRate !== undefined) dbUpdates.conversion_rate = updates.conversionRate;
      await supabase.from('trips').update(dbUpdates).eq('id', id);
      setTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
    }
  }, [storageMode, trips, localKey]);

  const deleteTrip = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = trips.filter((t) => t.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTrips(updated);
    } else {
      await supabase.from('trips').delete().eq('id', id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    }
  }, [storageMode, trips, localKey]);

  const getTripById = useCallback(
    (id: string) => trips.find((t) => t.id === id),
    [trips]
  );

  return { trips, loading, refresh, addTrip, updateTrip, deleteTrip, getTripById };
}
