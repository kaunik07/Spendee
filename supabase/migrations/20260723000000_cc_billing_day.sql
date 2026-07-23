-- Payment due day-of-month (1–31) for credit cards, used for due-date reminders.
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS billing_day SMALLINT CHECK (billing_day BETWEEN 1 AND 31);
