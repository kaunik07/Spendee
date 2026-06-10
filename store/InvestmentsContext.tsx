import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useInvestments } from './useInvestments';

type InvestmentsContextType = ReturnType<typeof useInvestments>;

const InvestmentsContext = createContext<InvestmentsContextType | null>(null);

export function InvestmentsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useInvestments(user?.id ?? null, storageMode);
  return <InvestmentsContext.Provider value={value}>{children}</InvestmentsContext.Provider>;
}

export function useInvestmentsContext() {
  const ctx = useContext(InvestmentsContext);
  if (!ctx) throw new Error('useInvestmentsContext must be used within InvestmentsProvider');
  return ctx;
}
