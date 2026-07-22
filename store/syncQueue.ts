import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { notifySync } from './syncBus';

// Generic offline operation queue for online mode. Every online write becomes
// an op that's applied optimistically to local state and queued; the queue
// replays to Supabase (in order) whenever connectivity returns. Replay is
// idempotent so a flaky reconnect can never double-apply:
//   • insert  — upsert(ignoreDuplicates) keyed on the client-generated id
//   • update  — full-row overwrite (last-write-wins across devices)
//   • delete  — delete by id (deleting a missing row is a no-op)
//   • balance — a DELTA applied via an RPC guarded by the op id (exactly-once)
// Balances are deltas ("subtract 20"), never absolutes, so concurrent writes
// from multiple devices compose correctly instead of clobbering each other.

export type SyncOp =
  | { id: string; kind: 'insert'; table: string; row: Record<string, any> }
  | { id: string; kind: 'update'; table: string; rowId: string; row: Record<string, any> }
  | { id: string; kind: 'delete'; table: string; rowId: string }
  | { id: string; kind: 'balanceAccount'; accountId: string; delta: number }
  | { id: string; kind: 'balanceCard'; cardId: string; delta: number };

const key = (userId: string) => `@spendee_sync_queue_${userId}`;

export async function getQueue(userId: string): Promise<SyncOp[]> {
  const raw = await AsyncStorage.getItem(key(userId));
  return raw ? (JSON.parse(raw) as SyncOp[]) : [];
}

async function saveQueue(userId: string, ops: SyncOp[]): Promise<void> {
  await AsyncStorage.setItem(key(userId), JSON.stringify(ops));
}

export async function enqueue(userId: string, ...ops: SyncOp[]): Promise<void> {
  const q = await getQueue(userId);
  await saveQueue(userId, [...q, ...ops]);
}

export async function removeOp(userId: string, opId: string): Promise<void> {
  const q = await getQueue(userId);
  await saveQueue(userId, q.filter((o) => o.id !== opId));
}

async function apply(op: SyncOp): Promise<{ error: any }> {
  switch (op.kind) {
    case 'insert':
      return await supabase.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true });
    case 'update':
      return await supabase.from(op.table).update(op.row).eq('id', op.rowId);
    case 'delete':
      return await supabase.from(op.table).delete().eq('id', op.rowId);
    case 'balanceAccount':
      return await supabase.rpc('adjust_account_balance', { p_account: op.accountId, p_delta: op.delta, p_op: op.id });
    case 'balanceCard':
      return await supabase.rpc('adjust_card_balance', { p_card: op.cardId, p_delta: op.delta, p_op: op.id });
  }
}

// Replay the queue FIFO. Stops on the first failure (offline / server error) so
// order is preserved; the remaining ops retry on the next trigger.
export async function flushQueue(userId: string): Promise<{ flushed: number; remaining: number }> {
  const ops = await getQueue(userId);
  let flushed = 0;
  for (const op of ops) {
    const { error } = await apply(op);
    if (error) break;
    await removeOp(userId, op.id);
    flushed++;
  }
  const remaining = (await getQueue(userId)).length;
  return { flushed, remaining };
}

// Convenience for stores: push the queue to the server (if reachable) and then
// tell every store to re-materialize. Safe to call fire-and-forget after a write.
export async function flushAndNotify(userId: string): Promise<void> {
  await flushQueue(userId);
  notifySync();
}

// Op ids must be bare UUIDs: a balance op's id doubles as the applied_ops
// idempotency key (a uuid column) in the adjust_*_balance RPCs.
export const opId = () => Crypto.randomUUID();

// ── Materialization helpers (show pending ops on top of fetched data) ──

// Apply pending insert/update/delete ops for one table onto server rows
// (DB-shaped). Returns the rows a user should see before the queue drains.
export function materializeRows(serverRows: any[], ops: SyncOp[], table: string): any[] {
  let rows = [...serverRows];
  for (const op of ops) {
    if (op.kind === 'insert' && op.table === table) {
      if (!rows.some((r) => r.id === op.row.id)) rows = [op.row, ...rows];
    } else if (op.kind === 'update' && op.table === table) {
      rows = rows.map((r) => (r.id === op.rowId ? { ...r, ...op.row } : r));
    } else if (op.kind === 'delete' && op.table === table) {
      rows = rows.filter((r) => r.id !== op.rowId);
    }
  }
  return rows;
}

// Ids that have a pending (not-yet-synced) insert or update op for a table.
export function pendingRowIds(ops: SyncOp[], table: string): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.kind === 'insert' && op.table === table) ids.add(op.row.id);
    if (op.kind === 'update' && op.table === table) ids.add(op.rowId);
  }
  return ids;
}

// Sum of pending balance deltas per target id.
export function pendingBalanceDeltas(ops: SyncOp[], kind: 'balanceAccount' | 'balanceCard'): Record<string, number> {
  const map: Record<string, number> = {};
  for (const op of ops) {
    if (op.kind === 'balanceAccount' && kind === 'balanceAccount') map[op.accountId] = (map[op.accountId] ?? 0) + op.delta;
    if (op.kind === 'balanceCard' && kind === 'balanceCard') map[op.cardId] = (map[op.cardId] ?? 0) + op.delta;
  }
  return map;
}

export function pendingCount(ops: SyncOp[]): number {
  return ops.length;
}
