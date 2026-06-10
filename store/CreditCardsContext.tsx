import React, { createContext, useCallback, useContext, useState } from 'react';
import { useAuthContext } from './AuthContext';
import { useCreditCards } from './useCreditCards';

type CreditCardsContextType = ReturnType<typeof useCreditCards> & {
  ccTxnVersion: number;
  bumpCCTxnVersion: () => void;
};

const CreditCardsContext = createContext<CreditCardsContextType | null>(null);

export function CreditCardsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const cards = useCreditCards(user?.id ?? null, storageMode);
  const [ccTxnVersion, setCCTxnVersion] = useState(0);
  const bumpCCTxnVersion = useCallback(() => setCCTxnVersion((v) => v + 1), []);
  const value = { ...cards, ccTxnVersion, bumpCCTxnVersion };
  return <CreditCardsContext.Provider value={value}>{children}</CreditCardsContext.Provider>;
}

export function useCreditCardsContext() {
  const ctx = useContext(CreditCardsContext);
  if (!ctx) throw new Error('useCreditCardsContext must be used within CreditCardsProvider');
  return ctx;
}
