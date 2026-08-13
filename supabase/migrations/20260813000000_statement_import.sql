-- ============================================================
-- Statement import — schema.
--
-- Adds:
--   1) merchant_categories — global merchant → category map (Worker-only)
--   2) merchant_overrides  — what THIS user means by a merchant
--   3) bank / default_doc_type on credit_cards + bank_accounts
--   4) import_id / import_fingerprint on expenses, with a dedupe index
--   5) statement_imports   — one bookkeeping row per import, for undo
--
-- The commit function that writes into all of this lives in the next
-- migration (…_import_commit_rpc.sql).
-- ============================================================

-- ── Global merchant map ───────────────────────────────────
-- Populated from the seed migration and from the categorizer Worker; read by
-- every user's import. RLS is enabled with NO policies and no grants, so only
-- the Worker's service role can reach it — a globally-shared table that any
-- authenticated client could write is a table one user can poison for everyone.
CREATE TABLE IF NOT EXISTS public.merchant_categories (
  merchant_key TEXT        PRIMARY KEY,       -- normalized, e.g. 'BLUE BOTTLE COFFEE'
  category     TEXT        NOT NULL,          -- a Categories id (constants/theme.ts)
  subcategory  TEXT        DEFAULT NULL,
  source       TEXT        NOT NULL CHECK (source IN ('seed', 'model', 'crowd')),
  confidence   REAL        NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.merchant_categories ENABLE ROW LEVEL SECURITY;
-- (intentionally no policies and no GRANTs — service_role bypasses RLS)

-- ── Per-user merchant overrides ───────────────────────────
-- One person files Amazon as shopping, another as groceries; neither is wrong,
-- so neither belongs in the global map. A user correction lands here and only
-- here, which is what keeps one person's taste out of everyone's defaults.
CREATE TABLE IF NOT EXISTS public.merchant_overrides (
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  merchant_key TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  subcategory  TEXT        DEFAULT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, merchant_key)
);
ALTER TABLE public.merchant_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "merchant_overrides_own" ON public.merchant_overrides;
CREATE POLICY "merchant_overrides_own" ON public.merchant_overrides
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Which bank a card/account belongs to ──────────────────
-- The import screen needs a parser profile, and the user already told us which
-- card this is — so the bank rides along on the record instead of being asked
-- for on every import. Nullable because every existing row predates this; the
-- import screen back-fills it inline the first time and never asks again.
--
-- Deliberately free text rather than an enum: the profile registry in
-- lib/statement/registry.ts is the source of truth for which banks parse, and
-- adding a bank there should not require a migration here.
--
-- default_doc_type overrides the user's global preference for this one card,
-- for the realistic case of downloading statements for one and reports for
-- another. NULL means "fall back to the global preference".
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS bank             TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_doc_type TEXT DEFAULT NULL
    CONSTRAINT credit_cards_default_doc_type_check
    CHECK (default_doc_type IN ('statement', 'spending_report'));

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS bank             TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_doc_type TEXT DEFAULT NULL
    CONSTRAINT bank_accounts_default_doc_type_check
    CHECK (default_doc_type IN ('statement', 'spending_report'));

-- ── Import provenance on expenses ─────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS import_id          UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_fingerprint TEXT DEFAULT NULL;

-- Partial, so the thousands of manually-added expenses (NULL fingerprint) are
-- untouched and unconstrained. Its job is to make a re-import of an overlapping
-- statement period a no-op at the DATABASE level — the review UI also flags
-- duplicates, but a double-clicked commit or a retried request must not be able
-- to double-charge the balance even if that client-side check is stale.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_import_fingerprint
  ON public.expenses(user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;

-- Undo reads by this.
CREATE INDEX IF NOT EXISTS idx_expenses_import
  ON public.expenses(user_id, import_id)
  WHERE import_id IS NOT NULL;

-- ── Import bookkeeping ────────────────────────────────────
-- One row per commit. Holds what "undo" needs (which rows, which balance op,
-- how much the balance actually moved) and lets a repeat upload of the same
-- file say "you already imported this on <date>" before doing any parsing.
CREATE TABLE IF NOT EXISTS public.statement_imports (
  id                UUID           PRIMARY KEY,
  user_id           UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_file       TEXT           NOT NULL DEFAULT '',
  file_sha256       TEXT           DEFAULT NULL,
  period_start      TEXT           DEFAULT NULL,
  period_end        TEXT           DEFAULT NULL,
  payment_type      TEXT           DEFAULT NULL,
  payment_source_id UUID           DEFAULT NULL,
  row_count         INT            NOT NULL DEFAULT 0,
  inserted_count    INT            NOT NULL DEFAULT 0,
  skipped_count     INT            NOT NULL DEFAULT 0,
  applied_delta     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_op_id     UUID           DEFAULT NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);
ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "statement_imports_own" ON public.statement_imports;
CREATE POLICY "statement_imports_own" ON public.statement_imports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_statement_imports_user
  ON public.statement_imports(user_id, created_at DESC);

-- Deliberately NOT added to supabase_realtime: no client subscribes to the
-- merchant map, overrides, or import bookkeeping, and a 200-row import already
-- generates enough realtime traffic on expenses (see store/useRealtimeRefresh).
