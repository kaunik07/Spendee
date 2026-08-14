// Statement import — the bulk commit and its undo.
//
// A plain module, not a hook: this is a one-shot, online-only operation, not
// state a component subscribes to. Guarded to storageMode === 'online' —
// statement import is web-only (see the plan), and web already requires a
// real account (AuthGuard bounces a signed-out web user to /login), so there
// is no local/guest path to support here.
//
// Deliberately bypasses store/syncQueue.ts. SyncOp's insert carries exactly
// one row and flushQueue replays serially, rewriting the whole queue to
// AsyncStorage after every op — 200 linked rows would be ~600 sequential
// round trips. Both RPCs this file calls do the whole thing in one Postgres
// transaction instead; see the migrations for why.

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { getCategoryById } from '@/constants/theme';
import { notifySync } from './syncBus';
import type { StorageMode } from './storageMode';

export interface ImportRow {
  /** Post-normalization display name (Expense.name). */
  name: string;
  /** The raw bank descriptor, kept for Expense.note. Never sent to the categorizer. */
  rawDescription: string;
  category: string;
  subcategory?: string | null;
  /** From lib/statement/subcategorize.ts — airline, cab provider, restaurant, store... */
  details?: Record<string, string> | null;
  date: string;             // YYYY-MM-DD
  amount: number;           // positive; only debits ever reach this function
  /** From lib/statement/fingerprint.ts — the duplicate-detection key. */
  fingerprint: string;
}

export interface CommitImportParams {
  userId: string;
  storageMode: StorageMode | null;
  sourceFile: string;
  fileSha256: string | null;
  period: { start: string; end: string } | null;
  /** null = not linked to any account/card — imported as unlinked expenses. */
  paymentType: 'bank_account' | 'credit_card' | null;
  paymentSourceId: string | null;
  /** Already filtered to just the checked, non-duplicate rows by the review UI. */
  rows: ImportRow[];
}

export interface CommitImportResult {
  importId: string;
  inserted: number;
  skipped: number;
  appliedDelta: number;
}

const opId = () => Crypto.randomUUID();

export async function commitStatementImport(params: CommitImportParams): Promise<CommitImportResult> {
  const { userId, storageMode, sourceFile, fileSha256, period, paymentType, paymentSourceId, rows } = params;

  if (storageMode !== 'online') {
    throw new Error('Statement import requires an online account.');
  }
  if (!rows.length) {
    throw new Error('Nothing to import.');
  }
  // Mirrors the Worker's own cap (see worker/src/categorize.ts's MAX_KEYS
  // neighbor) and the migration's import_statement_expenses row limit — fail
  // here with a clear message rather than let PostgREST reject an oversized
  // payload.
  if (rows.length > 500) {
    throw new Error('Too many transactions for one import (max 500) — try a shorter period.');
  }

  const importId = Crypto.randomUUID();
  const balanceOp = opId();
  const now = Date.now();
  const isLinked = paymentType != null && paymentSourceId != null;

  // One id per row, generated up front so both the expense record and its
  // ledger transaction can reference the same value without threading it
  // through afterward.
  const linkedTransactionIds = rows.map(() => (isLinked ? Crypto.randomUUID() : null));

  const pExpenses = rows.map((r, i) => ({
    id: Crypto.randomUUID(),
    name: r.name,
    amount: r.amount,
    category: r.category,
    note: r.rawDescription,
    date: r.date,
    // Offset per row, not one shared timestamp — created_at has no DB
    // default and drives display order, so identical timestamps make that
    // order arbitrary.
    created_at: now + i,
    subcategory: r.subcategory ?? null,
    details: r.details ?? null,
    import_fingerprint: r.fingerprint,
    linked_transaction_id: linkedTransactionIds[i],
  }));

  const txns = isLinked
    ? rows.map((r, i) => ({
        id: linkedTransactionIds[i],
        amount: r.amount,
        // Same convention as AddExpenseSheet.tsx's txnNote: "<Category label> - <name>".
        note: `${getCategoryById(r.category).label} - ${r.name}`,
        date: r.date,
        created_at: now + i,
      }))
    : [];

  const { data, error } = await supabase.rpc('import_statement_expenses', {
    p_import_id: importId,
    p_source_file: sourceFile,
    p_file_sha256: fileSha256,
    p_period_start: period?.start ?? null,
    p_period_end: period?.end ?? null,
    p_payment_type: paymentType,
    p_source_id: paymentSourceId,
    p_balance_op: balanceOp,
    p_expenses: pExpenses,
    p_txns: txns,
  });

  if (error) throw new Error(error.message);

  // The RPC is one transaction, but nothing here waits on realtime to learn
  // about it — every affected hook (expenses, the account/card whose balance
  // moved) refreshes explicitly, the same discipline addExpense already
  // follows for a single insert.
  notifySync();

  return {
    importId,
    inserted: data?.inserted ?? 0,
    skipped: data?.skipped ?? 0,
    appliedDelta: Number(data?.applied_delta ?? 0),
  };
}

export interface UndoImportResult {
  deleted: number;
  reversedDelta: number;
  alreadyUndone: boolean;
}

export async function undoStatementImport(importId: string): Promise<UndoImportResult> {
  const { data, error } = await supabase.rpc('undo_statement_import', { p_import_id: importId });
  if (error) throw new Error(error.message);

  notifySync();

  return {
    deleted: data?.deleted ?? 0,
    reversedDelta: Number(data?.reversed_delta ?? 0),
    alreadyUndone: !!data?.already_undone,
  };
}
