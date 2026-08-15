// Statement import — turning parsed RawTxn[] into what the review table
// actually renders: a merchant name, a category (+ subcategory + detail),
// a duplicate flag, and a default include state. Kept separate from the UI
// so the categorization/duplicate logic is testable without a screen.

import { normalizeMerchant } from './merchant';
import { inferSubcategory } from './subcategorize';
import { fingerprintAll } from './fingerprint';
import { isPaymentDescriptor } from './refund';
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
  /** A real payment (autopay, bank transfer) — excluded, collapsed. Never true at the same time as isRefund. */
  isCredit: boolean;
  /** A merchant refund reversing an earlier purchase — included by default, imported as a negative expense. See lib/statement/refund.ts. */
  isRefund: boolean;
  /** What actually gets written to Expense.amount: raw.amount, negated when isRefund. */
  signedAmount: number;
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
 *
 * subcategory always prefers local when it has one — it's a curated brand
 * match (Lyft, an airline, a car-rental chain) or a reliable structural read
 * (food that isn't a delivery app is dining), never a guess.
 *
 * details is where the merge has to be careful. Two of subcategorize.ts's
 * branches — dining's catch-all and groceries' only branch — don't identify
 * anything; they just echo `merchantName` back as the "restaurant"/"store"
 * because that's the only name available locally. That echo is exactly what
 * Gemini's `detail` field exists to do better (it can turn a normalized
 * merchant string into "Chipotle Mexican Grill"), so when local's detail IS
 * that echo, prefer whatever the Worker returned. A local brand match's
 * detail (an airline name, 'Lyft') is never an echo of merchantName, so it
 * keeps winning — that's real local identification, not a placeholder.
 */
function resolveSubcategory(info: MerchantInfo, raw: string, merchantName: string): { subcategory: string | null; details: Record<string, string> | null } {
  if (info.fromOverride) return { subcategory: info.subcategory, details: info.details };

  const local = inferSubcategory(info.category, raw, merchantName);
  const subcategory = local.subcategory ?? info.subcategory;

  const localIsEcho = !!local.details && Object.values(local.details).includes(merchantName);
  const details = localIsEcho ? (info.details ?? local.details) : (local.details ?? info.details);

  return { subcategory, details };
}

export async function buildReviewRows(
  txns: RawTxn[],
  existing: ExistingExpenseLite[],
): Promise<ReviewRow[]> {
  const normalized = txns.map((t) => normalizeMerchant(t.description));

  // Credit/refund classification has to happen before fingerprinting — the
  // fingerprint is keyed on the SIGNED amount (see fingerprint.ts), so a
  // refund and an ordinary purchase of the same magnitude/day/merchant must
  // land in different (date, merchantKey, cents) groups, not collide as the
  // same transaction.
  const creditFlags = txns.map((t) => t.direction === 'credit' && isPaymentDescriptor(t.description));
  const refundFlags = txns.map((t, i) => t.direction === 'credit' && !creditFlags[i]);
  const signedAmounts = txns.map((t, i) => (refundFlags[i] ? -t.amount : t.amount));

  const fingerprints = await fingerprintAll(
    txns.map((t, i) => ({ date: t.date, merchantKey: normalized[i].key, amount: signedAmounts[i] })),
  );

  const distinctKeys = [...new Set(normalized.map((n) => n.key))];
  const infoByKey = await resolveMerchantInfo(distinctKeys);

  const existingFingerprints = new Set(
    existing.map((e) => e.importFingerprint).filter((f): f is string => !!f),
  );
  // date|cents -> existing expense, for the near-duplicate check. Keyed by
  // the SIGNED amount, same convention Expense.amount now stores — a
  // purchase and a refund of the same merchant/magnitude/day are two
  // different real events and must not collide with each other here.
  const byDateAmount = new Map<string, ExistingExpenseLite>();
  for (const e of existing) byDateAmount.set(`${e.date}|${Math.round(e.amount * 100)}`, e);

  return txns.map((t, i) => {
    const { key: merchantKey, display } = normalized[i];
    const info = infoByKey[merchantKey] ?? { category: 'other', subcategory: null, details: null, fromOverride: false };
    const { subcategory, details } = resolveSubcategory(info, t.description, display);

    // A credit-direction row is either a real payment (autopay, bank
    // transfer — never touched a category, stays excluded) or a merchant
    // refund (reverses an earlier purchase — belongs in the expense list as
    // a negative amount so that category's spend stays accurate). See
    // lib/statement/refund.ts for the distinguishing signal.
    const isCredit = creditFlags[i];
    const isRefund = refundFlags[i];
    const signedAmount = signedAmounts[i];
    const fingerprint = fingerprints[i];

    let dup: ReviewRow['dup'] = null;
    if (existingFingerprints.has(fingerprint)) {
      dup = { type: 'exact', note: 'Already imported' };
    } else if (!isCredit) {
      const match = byDateAmount.get(`${t.date}|${Math.round(signedAmount * 100)}`);
      if (match) dup = { type: 'near', note: `Matches "${match.name}" already in your expenses` };
    }

    return {
      key: `${t.page}-${t.row}`,
      raw: t,
      merchantKey,
      name: display,
      category: info.category,
      subcategory,
      details,
      fingerprint,
      isCredit,
      isRefund,
      signedAmount,
      dup,
      included: !isCredit && dup?.type !== 'exact',
    };
  });
}
