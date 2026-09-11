import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useTopicExpenses } from './useTopicExpenses';

type TopicExpensesContextType = ReturnType<typeof useTopicExpenses>;

const TopicExpensesContext = createContext<TopicExpensesContextType | null>(null);

export function TopicExpensesProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useTopicExpenses(user?.id ?? null, storageMode);
  return <TopicExpensesContext.Provider value={value}>{children}</TopicExpensesContext.Provider>;
}

export function useTopicExpensesContext() {
  const ctx = useContext(TopicExpensesContext);
  if (!ctx) throw new Error('useTopicExpensesContext must be used within TopicExpensesProvider');
  return ctx;
}
