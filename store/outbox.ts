import AsyncStorage from '@react-native-async-storage/async-storage';

// Offline outbox for online-mode expense adds.
// When the device is offline, an expense is written here (with a
// client-generated UUID that becomes the real DB row id) and shown
// optimistically; it's flushed to Supabase once connectivity returns.
// Using the client-side id makes retries idempotent — a re-insert of an
// already-synced row hits the primary-key conflict (23505) and is treated
// as done, so a flaky network can never create duplicates.

export interface OutboxExpense {
  id: string;                 // client UUID → becomes expenses.id
  user_id: string;
  name: string;
  amount: number;
  category: string;
  note: string;
  date: string;
  created_at: number;
  subcategory: string | null;
  details: Record<string, any> | null;
  payment_type: 'bank_account' | 'credit_card' | null;
  payment_source_id: string | null;
  linked_transaction_id: string | null;
}

const key = (userId: string) => `@spendee_expense_outbox_${userId}`;

export async function getOutbox(userId: string): Promise<OutboxExpense[]> {
  const raw = await AsyncStorage.getItem(key(userId));
  return raw ? JSON.parse(raw) : [];
}

export async function saveOutbox(userId: string, items: OutboxExpense[]): Promise<void> {
  await AsyncStorage.setItem(key(userId), JSON.stringify(items));
}

export async function enqueueExpense(userId: string, item: OutboxExpense): Promise<void> {
  const items = await getOutbox(userId);
  await saveOutbox(userId, [...items, item]);
}

export async function removeFromOutbox(userId: string, id: string): Promise<void> {
  const items = await getOutbox(userId);
  await saveOutbox(userId, items.filter((i) => i.id !== id));
}
