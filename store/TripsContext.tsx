import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useTrips } from './useTrips';

type TripsContextType = ReturnType<typeof useTrips>;

const TripsContext = createContext<TripsContextType | null>(null);

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useTrips(user?.id ?? null, storageMode);
  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTripsContext() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error('useTripsContext must be used within TripsProvider');
  return ctx;
}
