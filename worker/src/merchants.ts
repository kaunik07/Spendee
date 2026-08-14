/**
 * Supabase REST access for the global merchant map.
 *
 * Raw fetch against PostgREST, not the supabase-js SDK — same reasoning as
 * Trip Planner's worker/src/supabase-cache.ts: nothing else in this Worker
 * pulls in a client library, so a heavier SDK for two tables would be the odd
 * one out.
 *
 * merchant_categories is RLS-enabled with NO policies. Only the service role
 * can reach it at all, which is the point: a globally-shared table any
 * authenticated client could write is a table one user can poison for
 * everyone.
 */

export interface MerchantEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const TIMEOUT_MS = 8_000;

async function restServiceRole(env: MerchantEnv, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

export interface CategoryRow {
  category: string;
  subcategory: string | null;
  source: 'seed' | 'model' | 'crowd';
}

/**
 * Batched lookup across the global map. One request regardless of how many
 * keys are asked for — a 200-row statement with 60 distinct merchants costs
 * exactly this one call, not 60.
 */
export async function getGlobalCategories(
  env: MerchantEnv, keys: string[],
): Promise<Map<string, CategoryRow>> {
  const out = new Map<string, CategoryRow>();
  if (!keys.length) return out;

  const q = new URLSearchParams({
    merchant_key: `in.(${keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(',')})`,
    select: 'merchant_key,category,subcategory,source',
  });
  const res = await restServiceRole(env, `merchant_categories?${q}`);
  if (!res.ok) return out;

  const rows = await res.json<{ merchant_key: string; category: string; subcategory: string | null; source: CategoryRow['source'] }[]>();
  for (const r of rows) out.set(r.merchant_key, { category: r.category, subcategory: r.subcategory, source: r.source });
  return out;
}

/**
 * Insert-only, ON CONFLICT DO NOTHING. Never an UPDATE: a merchant with any
 * existing row (seed, crowd, or an earlier model answer) is never re-asked,
 * so there's nothing to overwrite here — writing only happens for a key that
 * was absent moments ago. DO NOTHING also protects the race where two users
 * import the same brand-new merchant at once.
 */
export async function insertGlobalCategoriesIfAbsent(
  env: MerchantEnv,
  rows: { merchant_key: string; category: string; source: 'model' | 'crowd' }[],
): Promise<void> {
  if (!rows.length) return;
  await restServiceRole(env, 'merchant_categories?on_conflict=merchant_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows.map((r) => ({ ...r, confidence: r.source === 'model' ? 0.9 : 0 }))),
  });
}
