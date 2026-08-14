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
