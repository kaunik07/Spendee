/**
 * Spendee statement-import backend.
 *
 * Exists for exactly one reason: the merchant->category map is shared across
 * every user (merchant_categories, RLS-locked to service_role with no
 * policies at all), and the Gemini key that fills gaps in it can't ship in a
 * browser bundle. That's the whole job — parsing the PDF happens in the
 * browser, never here, so the statement itself never reaches this Worker or
 * anything downstream of it. Only normalized merchant name strings do.
 *
 * Deploy:
 *   npx wrangler secret put GEMINI_API_KEY
 *   npx wrangler secret put GEMINI_API_KEY_2          (optional second key)
 *   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
 *   npx wrangler deploy
 */

import { verifyCaller } from './auth';
import { categorize, CategorizeEnv } from './categorize';
import { submitFeedback } from './feedback';
import { reserve, currentDay, currentMonth } from './quota';

export { QuotaCounter } from './quota';

interface Env extends CategorizeEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Unlike Trip Planner's `Access-Control-Allow-Origin: *` — that Worker takes
 * no Authorization header and returns nothing user-specific. This one takes a
 * bearer token on every request, so the origin is checked against an
 * allowlist and echoed rather than left open.
 */
const ALLOWED_ORIGINS = [
  /^https:\/\/spendee\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.spendee\.pages\.dev$/,   // Cloudflare Pages preview deploys
  /^http:\/\/localhost:8081$/,                       // expo start --web
  /^http:\/\/127\.0\.0\.1:8081$/,
];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
  if (allowed && origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/** Every error response carries no statement content — just a code and a plain-language message. */
function errorResponse(code: string, message: string, status: number, origin: string | null): Response {
  return json({ error: { code, message } }, status, origin);
}

const GEMINI_MONTHLY_CAP = 1000;
/** Per user, per day — an abuse guard, not a product limit. Well above real usage. */
const PARSE_DAILY_CAP = 20;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    // Unauthenticated — mirrors Trip Planner's /quota: what's configured and
    // how much of the shared allowance is left, nothing user-specific.
    if (url.pathname === '/health' && request.method === 'GET') {
      const geminiGrant = await reserve(env.QUOTA, 'gemini', currentMonth(), GEMINI_MONTHLY_CAP, 0);
      return json({
        model: 'gemini-3.5-flash-lite',
        geminiKeyConfigured: !!env.GEMINI_API_KEY,
        fallbackKeyConfigured: !!env.GEMINI_API_KEY_2,
        supabaseConfigured: !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY,
        gemini: { used: geminiGrant.used, cap: geminiGrant.cap },
      }, 200, origin);
    }

    if (url.pathname !== '/categorize' && url.pathname !== '/merchant-feedback') {
      return errorResponse('not_found', 'No such endpoint.', 404, origin);
    }
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 'POST only.', 405, origin);
    }

    const authHeader = request.headers.get('Authorization');
    const user = await verifyCaller(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, authHeader);
    if (!user) {
      return errorResponse('unauthorized', 'Please sign in again.', 401, origin);
    }

    // Reserved before any work — an abuse guard that only checks after doing
    // the expensive part isn't a guard. Failing closed on this counter's own
    // unavailability is deliberate (see quota.ts): unlike the shared Gemini
    // cap, this one gates the whole request, not just the model call inside it.
    const dailyGrant = await reserve(env.QUOTA, `user:${user.id}`, currentDay(), PARSE_DAILY_CAP, 1);
    if (dailyGrant.granted < 1) {
      return errorResponse('quota_exceeded', "You've hit today's import limit.", 429, origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('invalid_request', 'Malformed JSON body.', 400, origin);
    }

    if (url.pathname === '/categorize') {
      const outcome = await categorize(env, (body as any)?.keys);
      if (!outcome.ok) return errorResponse('invalid_request', outcome.error, outcome.status, origin);
      return json(outcome.body, 200, origin);
    }

    // /merchant-feedback
    if (!authHeader) return errorResponse('unauthorized', 'Please sign in again.', 401, origin); // narrows for TS below
    const outcome = await submitFeedback(env, authHeader, user.id, (body as any)?.corrections);
    if (!outcome.ok) return errorResponse('invalid_request', outcome.error, outcome.status, origin);
    return json({ applied: outcome.applied, seeded: outcome.seeded }, 200, origin);
  },
};
