import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useBudgets } from './useBudgets';

type BudgetsContextType = ReturnType<typeof useBudgets>;

const BudgetsContext = createContext<BudgetsContextType | null>(null);

export function BudgetsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useBudgets(user?.id ?? null, storageMode);
  return <BudgetsContext.Provider value={value}>{children}</BudgetsContext.Provider>;
}

export function useBudgetsContext() {
  const ctx = useContext(BudgetsContext);
  if (!ctx) throw new Error('useBudgetsContext must be used within BudgetsProvider');
  return ctx;
}
