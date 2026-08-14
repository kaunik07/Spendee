/**
 * POST /merchant-feedback — the review table's corrections land here.
 *
 * Every correction writes to the caller's OWN override, under the caller's
 * own token — never the global row. That's what keeps one person's filing
 * choice (Amazon as groceries, say) from becoming everyone's default.
 *
 * The one exception: if the global map has no row for that merchant at all —
 * Gemini was unreachable, or quota was exhausted — the correction ALSO seeds
 * the global row, `source='crowd'`, but only when it's genuinely absent. It's
 * consulted only when a future user has no override of their own, and it's
 * strictly better than paying for a model call for a merchant a human has
 * already categorized for free.
 */

import { getGlobalCategories, insertGlobalCategoriesIfAbsent, MerchantEnv, upsertOverride } from './merchants';
import { isCategoryId } from './categories';

const MAX_CORRECTIONS = 300;
const MAX_KEY_LENGTH = 80;

export interface Correction {
  merchantKey: string;
  category: string;
  subcategory?: string | null;
}

function isCorrectionArray(v: unknown): v is Correction[] {
  return Array.isArray(v) && v.every(
    (c) => c && typeof c === 'object'
      && typeof (c as any).merchantKey === 'string'
      && typeof (c as any).category === 'string',
  );
}

export type FeedbackOutcome =
  | { ok: true; applied: number; seeded: number }
  | { ok: false; status: number; error: string };

export async function submitFeedback(
  env: MerchantEnv,
  callerAuthHeader: string,
  userId: string,
  rawCorrections: unknown,
): Promise<FeedbackOutcome> {
  if (!isCorrectionArray(rawCorrections)) {
    return { ok: false, status: 400, error: 'corrections must be an array of {merchantKey, category}' };
  }
  if (rawCorrections.length === 0) return { ok: true, applied: 0, seeded: 0 };
  if (rawCorrections.length > MAX_CORRECTIONS) {
    return { ok: false, status: 400, error: `too many corrections (max ${MAX_CORRECTIONS})` };
  }

  const valid = rawCorrections.filter(
    (c) => c.merchantKey.length > 0 && c.merchantKey.length <= MAX_KEY_LENGTH && isCategoryId(c.category),
  );
  if (!valid.length) return { ok: false, status: 400, error: 'no valid corrections in the request' };

  // Batched, not per-row: which of these merchants already have ANY global
  // row (seed, crowd, or an earlier model answer) decides whether this
  // correction also seeds the global map.
  const existing = await getGlobalCategories(env, valid.map((c) => c.merchantKey));

  let applied = 0;
  await Promise.all(valid.map(async (c) => {
    const ok = await upsertOverride(env, callerAuthHeader, userId, c.merchantKey, c.category, c.subcategory ?? null);
    if (ok) applied++;
  }));

  const toSeed = valid
    .filter((c) => !existing.has(c.merchantKey))
    .map((c) => ({ merchant_key: c.merchantKey, category: c.category, source: 'crowd' as const }));
  if (toSeed.length) await insertGlobalCategoriesIfAbsent(env, toSeed);

  return { ok: true, applied, seeded: toSeed.length };
}
