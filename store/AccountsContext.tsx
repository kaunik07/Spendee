import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useAccounts } from './useAccounts';

type AccountsContextType = ReturnType<typeof useAccounts>;

const AccountsContext = createContext<AccountsContextType | null>(null);

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useAccounts(user?.id ?? null, storageMode);
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccountsContext() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccountsContext must be used within AccountsProvider');
  return ctx;
}
