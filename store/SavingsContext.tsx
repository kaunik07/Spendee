import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useSavings } from './useSavings';

type SavingsContextType = ReturnType<typeof useSavings>;

const SavingsContext = createContext<SavingsContextType | null>(null);

export function SavingsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useSavings(user?.id ?? null, storageMode);
  return <SavingsContext.Provider value={value}>{children}</SavingsContext.Provider>;
}

export function useSavingsContext() {
  const ctx = useContext(SavingsContext);
  if (!ctx) throw new Error('useSavingsContext must be used within SavingsProvider');
  return ctx;
}
