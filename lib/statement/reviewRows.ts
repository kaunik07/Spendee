// Statement import — turning parsed RawTxn[] into what the review table
// actually renders: a merchant name, a category (+ subcategory + detail),
// a duplicate flag, and a default include state. Kept separate from the UI
// so the categorization/duplicate logic is testable without a screen.

import { normalizeMerchant } from './merchant';
import { inferSubcategory } from './subcategorize';
import { fingerprintAll } from './fingerprint';
import { categorizeMerchants, isStatementsConfigured } from '@/lib/statementApi';
import { supabase } from '@/lib/supabase';
import type { RawTxn } from './types';

export interface ReviewRow {
  /** Stable within one parse — `${page}-${row}` from the source RawTxn. */
  key: string;
  raw: RawTxn;
  merchantKey: string;
  name: string;
  category: string;
  subcategory: string | null;
  details: Record<string, string> | null;
  fingerprint: string;
  isCredit: boolean;
  dup: { type: 'exact' | 'near'; note: string } | null;
  included: boolean;
}

export interface ExistingExpenseLite {
  date: string;
  amount: number;
  name: string;
  importFingerprint: string | null;
}

/**
 * Resolution order, per merchant key: a per-user correction always wins (it's
 * the user overriding the map for themselves), then the shared map/model
 * answer, then 'other' — never fatal, never blocks the review step.
 */
async function resolveCategories(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const k of keys) result[k] = 'other';
  if (keys.length === 0) return result;

  if (isStatementsConfigured()) {
    try {
      const { map } = await categorizeMerchants(keys);
      for (const [k, v] of Object.entries(map)) result[k] = v.category;
    } catch {
      // Worker unreachable/misconfigured — every key stays 'other'. The
      // review step exists exactly to absorb this; it's not a failed import.
    }
  }

  const { data, error } = await supabase
    .from('merchant_overrides')
    .select('merchant_key, category')
    .in('merchant_key', keys);
  if (!error && data) {
    for (const row of data as { merchant_key: string; category: string }[]) {
      result[row.merchant_key] = row.category; // override always wins
    }
  }

  return result;
}

export async function buildReviewRows(
  txns: RawTxn[],
  existing: ExistingExpenseLite[],
): Promise<ReviewRow[]> {
  const normalized = txns.map((t) => normalizeMerchant(t.description));
  const fingerprints = await fingerprintAll(
    txns.map((t, i) => ({ date: t.date, merchantKey: normalized[i].key, amount: t.amount })),
  );

  const distinctKeys = [...new Set(normalized.map((n) => n.key))];
  const categoryByKey = await resolveCategories(distinctKeys);

  const existingFingerprints = new Set(
    existing.map((e) => e.importFingerprint).filter((f): f is string => !!f),
  );
  // date|cents -> existing expense, for the near-duplicate check. Debits
  // only — expenses never records a credit/payment, so a credit RawTxn has
  // nothing in this table to match against.
  const byDateAmount = new Map<string, ExistingExpenseLite>();
  for (const e of existing) byDateAmount.set(`${e.date}|${Math.round(e.amount * 100)}`, e);

  return txns.map((t, i) => {
    const { key: merchantKey, display } = normalized[i];
    const category = categoryByKey[merchantKey] ?? 'other';
    const { subcategory, details } = inferSubcategory(category, t.description, display);
    const isCredit = t.direction === 'credit';
    const fingerprint = fingerprints[i];

    let dup: ReviewRow['dup'] = null;
    if (existingFingerprints.has(fingerprint)) {
      dup = { type: 'exact', note: 'Already imported' };
    } else if (!isCredit) {
      const match = byDateAmount.get(`${t.date}|${Math.round(t.amount * 100)}`);
      if (match) dup = { type: 'near', note: `Matches "${match.name}" already in your expenses` };
    }

    return {
      key: `${t.page}-${t.row}`,
      raw: t,
      merchantKey,
      name: display,
      category,
      subcategory,
      details,
      fingerprint,
      isCredit,
      dup,
      included: !isCredit && dup?.type !== 'exact',
    };
  });
}
