# spendee-statements

The backend for Spendee's statement-import feature. Its entire job is to
categorize merchant names — nothing else.

## Why this exists

`merchant_categories` is shared across every user, so it can't be writable
by any client directly: one user's client could poison another user's
categorization. It's RLS-locked to `service_role` with no policies at all,
and the service-role key can't ship in a browser bundle. Same problem with
the Gemini API key. This Worker is the one place both of those live.

**The statement PDF itself never reaches this Worker.** Extraction and layout
parsing run entirely in the browser (`lib/statement/` in the app repo) — only
normalized merchant name strings, like `"BLUE BOTTLE COFFEE"`, are ever sent
here. No amounts, no dates, no account numbers, no balances.

## Supported documents

Bank profiles live in `lib/statement/profiles/` in the app repo, one file per
bank, each declaring its own `status: 'live' | 'in_development'`.

| Bank | Document | `docType` | Status |
|---|---|---|---|
| Chase | Credit card statement | `statement` | **Live** — calibrated against a real Chase Sapphire Reserve statement excerpt |
| Chase | Credit card spending report | `spending_report` | **Paused** — see below |
| Bank of America | Credit card statement | `statement` | Not started — listed in the UI, disabled |

**Chase spending report is intentionally paused, not broken or abandoned.**
`CHASE_CC_SPENDING_REPORT` in `chase.ts` is fully calibrated against a real
document (11 pages, 12 categories, ~250 transactions) — its `status` was
deliberately moved back to `'in_development'` so it can't be selected, and
the document-type picker step was removed from `app/import-statement.web.tsx`
entirely (statement is the only option shown). Re-enabling it later is a
one-line `status` flip plus restoring that UI step, not a recalibration.

The reason: statement import routes every transaction through the same
merchant-lookup + AI categorization pipeline this Worker provides (a
statement carries no Chase-assigned category to lean on), and the plan is
for subcategory-level detail too (e.g. which cab provider, which airline).
How the spending report's own category-per-section mapping — its `TRAVEL`
section currently maps to Spendee's `trip` category — should reconcile with
the app's existing `transport` subcategories (`flight`/`cab`/`car-rental`/
`cruise`/`train` live under `transport`, not `trip`, in
`constants/subcategories.ts`) is still an open design question. See the
`spending-report-paused` memory note for the same status recorded outside
this repo.

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Configured state and this month's Gemini usage. Nothing user-specific. |
| `POST /categorize` | Supabase session | `{keys: string[]}` → `{map, diagnostics}`. Checks the global map first; asks Gemini only about merchants nobody has seen, in batches of up to 60; writes new answers back so they're never asked again. |
| `POST /merchant-feedback` | Supabase session | `{corrections: [{merchantKey, category, subcategory?}]}`. Writes to the caller's own `merchant_overrides` row. Also seeds the global row with `source='crowd'`, but only when it's genuinely absent. |

Auth is `Authorization: Bearer <supabase access token>`, verified by asking
Supabase's own `GET /auth/v1/user` rather than checking the JWT locally — see
the comment at the top of `src/auth.ts` for why.

## Error shape

Every non-2xx response is `{"error": {"code", "message"}}`. `message` is
written for a user, and — like every response this Worker sends — carries no
statement content.

| HTTP | code | |
|---|---|---|
| 400 | `invalid_request` | Malformed body, or `keys`/`corrections` failed validation |
| 401 | `unauthorized` | Missing or invalid Supabase session |
| 404 | `not_found` | No such route |
| 405 | `method_not_allowed` | Wrong HTTP method |
| 429 | `quota_exceeded` | Per-user daily parse limit hit |

A Gemini failure (quota exhausted, upstream error) is never surfaced as an
error response — unmapped merchants just come back absent from `/categorize`'s
`map`, and the client's mandatory review step is what catches them.

## Local development

```sh
npm install
npx wrangler dev
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` come from `wrangler.toml` — both are
already public (they ship in the app bundle). For a local `GEMINI_API_KEY` /
`SUPABASE_SERVICE_ROLE_KEY`, create `worker/.dev.vars` (gitignored):

```
GEMINI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Smoke test without any of that:

```sh
curl http://127.0.0.1:8787/health

# 401 — no token
curl -X POST http://127.0.0.1:8787/categorize \
  -H "Content-Type: application/json" -d '{"keys":["NETFLIX"]}'
```

To exercise the authenticated path, grab a real access token from the
running web app's browser session:

```js
// in the browser console, on the running app
JSON.parse(localStorage.getItem('sb-csjccrztxcfnthmahxhr-auth-token')).access_token
```

```sh
curl -X POST http://127.0.0.1:8787/categorize \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"keys":["NETFLIX","SOME BRAND NEW MERCHANT"]}'
```

## Deploy

```sh
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GEMINI_API_KEY_2          # optional — a second Google Cloud project's key
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Then set `EXPO_PUBLIC_STATEMENTS_URL` to the deployed Worker's URL — in the
app's `.env`, in `eas.json`, and in the Cloudflare Pages project's build
environment variables (these are inlined at build time, so the Pages build
needs its own copy independent of a local `.env`).

## CORS

Only origins matching the allowlist in `src/index.ts` (`ALLOWED_ORIGINS`) get
`Access-Control-Allow-Origin` echoed back — everyone else's preflight
succeeds but the browser blocks the actual response. Add a new Pages preview
pattern or local dev port there if needed.
