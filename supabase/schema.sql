-- ============================================================
-- Spendee — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
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

-- ── Trips ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trips (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT    NOT NULL,
  created_at BIGINT  NOT NULL
);

-- ── Expenses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id         UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT           NOT NULL,
  amount     NUMERIC(10, 2) NOT NULL,
  category   TEXT           NOT NULL,
  note       TEXT           NOT NULL DEFAULT '',
  date       TEXT           NOT NULL,           -- YYYY-MM-DD
  created_at BIGINT         NOT NULL,
  trip_id    UUID           REFERENCES public.trips(id) ON DELETE SET NULL
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

-- ── Row Level Security ────────────────────────────────────
-- Every user can only read/write their own rows.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings  ENABLE ROW LEVEL SECURITY;

-- profiles: user can SELECT / INSERT / UPDATE their own row
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- trips: user owns all their trips
CREATE POLICY "trips_own" ON public.trips
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- expenses: user owns all their expenses
CREATE POLICY "expenses_own" ON public.expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- savings: user owns all their savings
CREATE POLICY "savings_own" ON public.savings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_trips_user         ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_user       ON public.savings(user_id);

-- ============================================================
-- IMPORTANT: In the Supabase Dashboard also do:
--   Authentication → Settings → "Enable email confirmations" → OFF
--   (The app uses a synthetic email, no real email is sent)
-- ============================================================
