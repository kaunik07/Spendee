import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { DocType } from '@/lib/statement/types';

// Modeled directly on useDefaultPayment.ts — same shape, same per-user
// AsyncStorage key pattern. A user-level preference, not synced to Supabase:
// it only ever affects which control is pre-selected on THIS device's import
// screen, never anything written to the database.
//
// Resolution order used by the import screen: the card's own
// defaultDocType override (store/useCreditCards.ts / useAccounts.ts) wins
// when set, else this global preference, else 'statement'.

function key(userId: string) {
  return `@spendee_import_prefs_${userId}`;
}

export interface ImportPrefs {
  defaultDocType: DocType;
}

const DEFAULT_PREFS: ImportPrefs = { defaultDocType: 'statement' };

export function useImportPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<ImportPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!userId) { setPrefs(DEFAULT_PREFS); return; }
    AsyncStorage.getItem(key(userId)).then((raw) => {
      if (raw) setPrefs(JSON.parse(raw));
    });
  }, [userId]);

  const setDefaultDocType = useCallback(async (defaultDocType: DocType) => {
    if (!userId) return;
    const value: ImportPrefs = { defaultDocType };
    await AsyncStorage.setItem(key(userId), JSON.stringify(value));
    setPrefs(value);
  }, [userId]);

  return { prefs, setDefaultDocType };
}
