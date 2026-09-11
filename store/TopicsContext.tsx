import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useTopics } from './useTopics';

type TopicsContextType = ReturnType<typeof useTopics>;

const TopicsContext = createContext<TopicsContextType | null>(null);

export function TopicsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useTopics(user?.id ?? null, storageMode);
  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopicsContext() {
  const ctx = useContext(TopicsContext);
  if (!ctx) throw new Error('useTopicsContext must be used within TopicsProvider');
  return ctx;
}
