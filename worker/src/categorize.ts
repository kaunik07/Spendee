/**
 * POST /categorize — the only place a merchant name ever reaches Gemini.
 *
 * Global map first, always. Gemini is asked about a batch of at most
 * GEMINI_BATCH_SIZE keys, and only the ones the global map has never seen —
 * so a merchant is sent to the model at most once, ever, across every user.
 * Whatever Gemini answers is written straight back to the global map, which
 * is what makes that guarantee hold on the very next import from anyone.
 *
 * Deliberately does NOT touch merchant_overrides. Overrides are per-user and
 * RLS-scoped to the caller's own session, so the client reads them directly
 * from Supabase with its own credentials — this endpoint has nothing to add
 * there, and keeping it out is what keeps this Worker's job to exactly one
 * thing: the table a client is not allowed to touch itself.
 */

import { CATEGORY_IDS, CATEGORY_LABELS, isCategoryId } from './categories';
import { callGeminiWithRetry } from './gemini';
import { getGlobalCategories, insertGlobalCategoriesIfAbsent, MerchantEnv } from './merchants';
import { QuotaGrant, reserve, currentMonth } from './quota';

/** Per Gemini call. Keeps prompts small and keeps one slow batch from blocking the rest. */
const GEMINI_BATCH_SIZE = 60;
/** Hard ceiling on one request's key list — a parsed statement caps at 500 rows, so this is generous. */
const MAX_KEYS = 300;
const MAX_KEY_LENGTH = 80;

export interface CategorizeEnv extends MerchantEnv {
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_2?: string;
  QUOTA: DurableObjectNamespace;
}

function geminiKeys(env: CategorizeEnv): string[] {
  return [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2].filter((k): k is string => !!k);
}

/** ~1000 calls/month across every user — a batch, not a per-merchant charge. */
const GEMINI_MONTHLY_CAP = 1000;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      merchant: { type: 'STRING' },
      category: { type: 'STRING', enum: [...CATEGORY_IDS] },
    },
    required: ['merchant', 'category'],
  },
};

function prompt(keys: string[]): string {
  const list = CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORY_LABELS[id]}`).join('\n');
  return `Classify each merchant name below into exactly one of these categories:
${list}

Use "other" when genuinely unsure — never guess a specific category you aren't
reasonably confident in. These are normalized merchant name strings only, with
no other context (no amounts, no dates, no location).

Merchants:
${JSON.stringify(keys)}

Reply with ONLY a JSON array, no prose and no markdown fences, one entry per
merchant in the same order, each { "merchant": "...", "category": "..." }.`;
}

interface GeminiAnswer { merchant: string; category: string }

function isGeminiAnswerArray(v: unknown): v is GeminiAnswer[] {
  return Array.isArray(v) && v.every(
    (x) => x && typeof x === 'object' && typeof (x as any).merchant === 'string' && typeof (x as any).category === 'string',
  );
}

export interface CategorizeResultEntry {
  category: string;
  source: 'map' | 'model';
}

export interface CategorizeResponse {
  map: Record<string, CategorizeResultEntry>;
  diagnostics: { cacheHits: number; modelCalls: number; modelAnswered: number; quota: QuotaGrant | null };
}

export type CategorizeOutcome =
  | { ok: true; body: CategorizeResponse }
  | { ok: false; status: number; error: string };

export async function categorize(env: CategorizeEnv, rawKeys: unknown): Promise<CategorizeOutcome> {
  if (!Array.isArray(rawKeys) || rawKeys.some((k) => typeof k !== 'string')) {
    return { ok: false, status: 400, error: 'keys must be an array of strings' };
  }
  if (rawKeys.length === 0) {
    return { ok: true, body: { map: {}, diagnostics: { cacheHits: 0, modelCalls: 0, modelAnswered: 0, quota: null } } };
  }
  if (rawKeys.length > MAX_KEYS) {
    return { ok: false, status: 400, error: `too many keys (max ${MAX_KEYS})` };
  }
  if (rawKeys.some((k) => k.length === 0 || k.length > MAX_KEY_LENGTH)) {
    return { ok: false, status: 400, error: `each key must be 1-${MAX_KEY_LENGTH} characters` };
  }

  // De-dupe, order-preserving — the parse can legitimately ask about the same
  // merchant more than once across different rows.
  const keys = [...new Set(rawKeys as string[])];

  const cached = await getGlobalCategories(env, keys);
  const map: Record<string, CategorizeResultEntry> = {};
  for (const [key, row] of cached) map[key] = { category: row.category, source: 'map' };

  const unresolved = keys.filter((k) => !cached.has(k));
  let modelCalls = 0;
  let modelAnswered = 0;
  let lastQuota: QuotaGrant | null = null;

  const keyGeminiKeys = geminiKeys(env);
  if (unresolved.length > 0 && keyGeminiKeys.length > 0) {
    for (let i = 0; i < unresolved.length; i += GEMINI_BATCH_SIZE) {
      const batch = unresolved.slice(i, i + GEMINI_BATCH_SIZE);

      // Reserved per Gemini call, not per merchant — a 60-key batch still
      // costs exactly one unit against the monthly cap.
      const grant = await reserve(env.QUOTA, 'gemini', currentMonth(), GEMINI_MONTHLY_CAP, 1);
      lastQuota = grant;
      if (grant.granted < 1) break; // exhausted — remaining batches (and this one) fall through to 'other' client-side

      let answers: GeminiAnswer[];
      try {
        const raw = await callGeminiWithRetry(keyGeminiKeys, prompt(batch), RESPONSE_SCHEMA);
        if (!isGeminiAnswerArray(raw)) throw new Error('malformed Gemini response shape');
        answers = raw;
      } catch {
        // Never fatal — the review step exists exactly to absorb an unmapped
        // merchant landing in 'other'. Move on to the next batch.
        continue;
      }
      modelCalls++;

      const toInsert: { merchant_key: string; category: string; source: 'model' }[] = [];
      for (const a of answers) {
        if (!keys.includes(a.merchant) || !isCategoryId(a.category)) continue;
        map[a.merchant] = { category: a.category, source: 'model' };
        modelAnswered++;
        toInsert.push({ merchant_key: a.merchant, category: a.category, source: 'model' });
      }
      if (toInsert.length) await insertGlobalCategoriesIfAbsent(env, toInsert);
    }
  }

  return {
    ok: true,
    body: {
      map,
      diagnostics: { cacheHits: cached.size, modelCalls, modelAnswered, quota: lastQuota },
    },
  };
}
