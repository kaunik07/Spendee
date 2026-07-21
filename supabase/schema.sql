-- ============================================================
-- Spendee — Supabase Schema (complete, v3)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- on a fresh project. Creates every table the app uses.
-- ============================================================

-- ── Profiles ──────────────────────────────────────────────
-- Extends auth.users with a public username.
-- Passwords are managed entirely by Supabase Auth (bcrypt).
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username          TEXT        UNIQUE NOT NULL,
  biometric_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile row whenever a user signs up.
-- The app signs up with a synthetic email (<username>@spendee.app)
-- and expects this trigger to exist — login fails with
-- "Profile not found" without it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Self-service account deletion (called from the app as
-- supabase.rpc('delete_user')). Deletes the calling user's auth row;
-- profiles and all data rows cascade via their foreign keys.
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM auth.users WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.delete_user() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- ── Expenses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id                    UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                  TEXT           NOT NULL,
  amount                NUMERIC(10, 2) NOT NULL,
  category              TEXT           NOT NULL,
  note                  TEXT           NOT NULL DEFAULT '',
  date                  TEXT           NOT NULL,           -- YYYY-MM-DD
  created_at            BIGINT         NOT NULL,
  subcategory           TEXT           DEFAULT NULL,       -- subcategory id (constants/subcategories.ts)
  details               JSONB          DEFAULT NULL,       -- per-subcategory extra info (future use)
  payment_type          TEXT           DEFAULT NULL,       -- 'bank_account' | 'credit_card'
  payment_source_id     UUID           DEFAULT NULL,       -- account id or card id
  linked_transaction_id UUID           DEFAULT NULL        -- txn created in that account/card
);

-- ── Savings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.savings (
  id         UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT           NOT NULL,
  amount     NUMERIC(10, 2) NOT NULL,
  note       TEXT           NOT NULL DEFAULT '',
  date       TEXT           NOT NULL,           -- YYYY-MM-DD
  created_at BIGINT         NOT NULL
);

-- ── Bank accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id         UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT           NOT NULL,
  balance    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at BIGINT         NOT NULL
);

-- ── Account transactions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_transactions (
  id         UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID           REFERENCES public.bank_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       TEXT           NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  note       TEXT           NOT NULL DEFAULT '',
  date       TEXT           NOT NULL,
  created_at BIGINT         NOT NULL
);

-- ── Credit cards ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id                  UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                TEXT           NOT NULL,
  outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_limit        NUMERIC(12, 2) DEFAULT NULL,
  created_at          BIGINT         NOT NULL
);

-- ── Credit card transactions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_card_transactions (
  id                         UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id                    UUID           REFERENCES public.credit_cards(id) ON DELETE CASCADE NOT NULL,
  user_id                    UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type                       TEXT           NOT NULL CHECK (type IN ('charge', 'payment')),
  amount                     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  note                       TEXT           NOT NULL DEFAULT '',
  date                       TEXT           NOT NULL,
  bank_account_id            UUID           REFERENCES public.bank_accounts(id) ON DELETE SET NULL DEFAULT NULL,
  linked_bank_transaction_id UUID           DEFAULT NULL,
  created_at                 BIGINT         NOT NULL
);

-- ── Budgets ───────────────────────────────────────────────
-- One monthly spending limit per category per user.
CREATE TABLE IF NOT EXISTS public.budgets (
  id            UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category      TEXT           NOT NULL,
  monthly_limit NUMERIC(12, 2) NOT NULL CHECK (monthly_limit > 0),
  pinned        BOOLEAN        NOT NULL DEFAULT false,   -- shown on the Home tab
  created_at    BIGINT         NOT NULL,
  UNIQUE (user_id, category)
);

-- ── Row Level Security ────────────────────────────────────
-- Every user can only read/write their own rows.

ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets                  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "expenses_own" ON public.expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "savings_own" ON public.savings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bank_accounts_own" ON public.bank_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "account_transactions_own" ON public.account_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "credit_cards_own" ON public.credit_cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "credit_card_transactions_own" ON public.credit_card_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budgets_own" ON public.budgets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Realtime ──────────────────────────────────────────────
-- Required for the app's live cross-device sync (postgres_changes).
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.expenses, public.savings, public.bank_accounts,
  public.account_transactions, public.credit_cards,
  public.credit_card_transactions, public.budgets, public.profiles;

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_savings_user       ON public.savings(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON public.bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_account_txns_account ON public.account_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user  ON public.credit_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_txns_card       ON public.credit_card_transactions(card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_user       ON public.budgets(user_id);

-- ============================================================
-- IMPORTANT: In the Supabase Dashboard also do:
--   Authentication → Settings → "Enable email confirmations" → OFF
--   (The app uses a synthetic email, no real email is sent)
-- ============================================================
