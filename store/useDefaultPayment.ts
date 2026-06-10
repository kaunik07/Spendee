import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export type DefaultPaymentType = 'bank_account' | 'credit_card' | null;

export interface DefaultPayment {
  type:     DefaultPaymentType;
  sourceId: string | null;
}

function key(userId: string) {
  return `@spendee_default_payment_${userId}`;
}

export function useDefaultPayment(userId: string | null) {
  const [defaultPayment, setDefaultPayment] = useState<DefaultPayment>({ type: null, sourceId: null });

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(key(userId)).then((raw) => {
      if (raw) setDefaultPayment(JSON.parse(raw));
    });
  }, [userId]);

  const saveDefault = useCallback(async (type: DefaultPaymentType, sourceId: string | null) => {
    if (!userId) return;
    const value: DefaultPayment = { type, sourceId };
    await AsyncStorage.setItem(key(userId), JSON.stringify(value));
    setDefaultPayment(value);
  }, [userId]);

  return { defaultPayment, saveDefault };
}
