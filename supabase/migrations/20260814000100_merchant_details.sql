-- Statement import — merchant_categories and merchant_overrides already had
-- a `subcategory` column (20260813000000_statement_import.sql) that nothing
-- ever populated: the Worker's /categorize never asked Gemini for one, and
-- the client's own subcategory logic (lib/statement/subcategorize.ts) was
-- built as a purely local, non-persisted fallback instead of wiring up to
-- it. This migration is the other half — `details` (airline, cab provider,
-- restaurant, store...) sitting next to `subcategory` for the same reason
-- expenses.details sits next to expenses.subcategory: one JSON bag for
-- whatever specific identity a subcategory carries.

ALTER TABLE public.merchant_categories
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT NULL;

ALTER TABLE public.merchant_overrides
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT NULL;
