import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useExpenses } from './useExpenses';

type ExpenseContextType = ReturnType<typeof useExpenses>;

const ExpenseContext = createContext<ExpenseContextType | null>(null);

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useExpenses(user?.id ?? null, storageMode);
  return <ExpenseContext.Provider value={value}>{children}</ExpenseContext.Provider>;
}

export function useExpenseContext() {
  const ctx = useContext(ExpenseContext);
  if (!ctx) throw new Error('useExpenseContext must be used within ExpenseProvider');
  return ctx;
}
