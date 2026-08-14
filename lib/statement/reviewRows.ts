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

interface MerchantInfo {
  category: string;
  subcategory: string | null;
  details: Record<string, string> | null;
  /** 'override' short-circuits the local-pattern-then-model cascade below entirely — it's the user's own last word on this merchant. */
  fromOverride: boolean;
}

/**
 * Resolution order, per merchant key:
 *   1. merchant_overrides — a per-user correction. Always wins outright,
 *      category/subcategory/details together, exactly as the user set them
 *      — this is the one path that bypasses the cascade below entirely.
 *   2. The Worker's /categorize — category always; subcategory + detail too,
 *      when Gemini had something to say and it passed validation against
 *      constants/subcategories.ts's own list (see categorize.ts's
 *      validateAnswer — a subcategory outside that list, or a constrained
 *      detail outside its fixed options, never reaches here at all).
 *   3. 'other' — the Worker is unreachable/unconfigured, or never learned
 *      this merchant, or its Gemini quota is exhausted this month. Never
 *      fatal; the review step is what absorbs it.
 */
async function resolveMerchantInfo(keys: string[]): Promise<Record<string, MerchantInfo>> {
  const result: Record<string, MerchantInfo> = {};
  for (const k of keys) result[k] = { category: 'other', subcategory: null, details: null, fromOverride: false };
  if (keys.length === 0) return result;

  if (isStatementsConfigured()) {
    try {
      const { map } = await categorizeMerchants(keys);
      for (const [k, v] of Object.entries(map)) {
        result[k] = { category: v.category, subcategory: v.subcategory, details: v.details, fromOverride: false };
      }
    } catch {
      // Worker unreachable/misconfigured — every key stays 'other'. The
      // review step exists exactly to absorb this; it's not a failed import.
    }
  }

  const { data, error } = await supabase
    .from('merchant_overrides')
    .select('merchant_key, category, subcategory, details')
    .in('merchant_key', keys);
  if (!error && data) {
    for (const row of data as { merchant_key: string; category: string; subcategory: string | null; details: Record<string, string> | null }[]) {
      result[row.merchant_key] = { category: row.category, subcategory: row.subcategory, details: row.details, fromOverride: true };
    }
  }

  return result;
}

/**
 * Local pattern-matching first, Gemini only for what the patterns miss.
 * subcategorize.ts covers five categories (transport, food, shopping,
 * groceries, subscriptions) with curated, zero-latency, zero-cost brand
 * matches — Lyft, DoorDash, Amazon and the like. When it has nothing to say
 * (a category it doesn't cover, or a merchant that doesn't match any of its
 * patterns), whatever the Worker already returned alongside category — from
 * the same round trip, no extra call — fills the gap.
 *
 * An override skips this entirely: it's the user's own last word, not a
 * default to refine further.
 */
function resolveSubcategory(info: MerchantInfo, raw: string, merchantName: string): { subcategory: string | null; details: Record<string, string> | null } {
  if (info.fromOverride) return { subcategory: info.subcategory, details: info.details };

  const local = inferSubcategory(info.category, raw, merchantName);
  if (local.subcategory || local.details) return local;

  return { subcategory: info.subcategory, details: info.details };
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
  const infoByKey = await resolveMerchantInfo(distinctKeys);

  const existingFingerprints = new Set(
    existing.map((e) => e.importFingerprint).filter((f): f is string => !!f),
  );
  // date|cents -> existing expense, for the near-duplicate check. Debits
  // only — expenses never records a credit/payment, so a credit RawTxn has
  // nothing in this table to match against.
  const byDateAmount = new Map<string, ExistingExpenseLite>();
  for (const e of existing) byDateAmount.set(`${e.date}|${Math.round(e.amount * 100)}`, e);

  return txns.map((t, i) => {
    const { key: merchantKey, display, cleanDisplay } = normalized[i];
    const info = infoByKey[merchantKey] ?? { category: 'other', subcategory: null, details: null, fromOverride: false };
    const { subcategory, details } = resolveSubcategory(info, t.description, cleanDisplay);
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
      name: cleanDisplay,
      display: display, // Keep full display for reference
      category: info.category,
      subcategory,
      details,
      fingerprint,
      isCredit,
      dup,
      included: !isCredit && dup?.type !== 'exact',
    };
  });
}
