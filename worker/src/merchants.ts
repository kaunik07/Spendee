/**
 * Supabase REST access for the two merchant tables.
 *
 * Raw fetch against PostgREST, not the supabase-js SDK — same reasoning as
 * Trip Planner's worker/src/supabase-cache.ts: nothing else in this Worker
 * pulls in a client library, so a heavier SDK for two tables would be the odd
 * one out.
 *
 * The two tables are reached with deliberately different credentials:
 *
 *   merchant_categories — RLS-enabled with NO policies. Only the service role
 *   can reach it at all, which is the point: a globally-shared table any
 *   authenticated client could write is a table one user can poison for
 *   everyone.
 *
 *   merchant_overrides — RLS-scoped to `auth.uid() = user_id`. Reached by
 *   FORWARDING the caller's own bearer token to PostgREST, never the service
 *   role, so this Worker never holds elevated access to a user's data — it
 *   can only do what the calling user's own session already permits.
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

/** Forwards the CALLER's own token, so RLS decides what this can touch — never service role. */
async function restAsCaller(
  env: MerchantEnv, callerAuthHeader: string, path: string, init: RequestInit = {},
): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: callerAuthHeader,
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

/**
 * Upserts the caller's own override — always wins for THIS user, and never
 * touches the global row. One person filing Amazon as groceries must never
 * become everyone's default.
 *
 * `userId` must be the id verifyCaller already extracted from this same
 * token (see auth.ts) — PostgREST doesn't fill user_id from the JWT on its
 * own, and the row's `WITH CHECK (auth.uid() = user_id)` policy rejects the
 * insert outright if it doesn't match, so this has to be sent explicitly.
 */
export async function upsertOverride(
  env: MerchantEnv, callerAuthHeader: string, userId: string,
  merchantKey: string, category: string, subcategory: string | null,
): Promise<boolean> {
  const res = await restAsCaller(env, callerAuthHeader, 'merchant_overrides?on_conflict=user_id,merchant_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, merchant_key: merchantKey, category, subcategory }),
  });
  return res.ok;
}
