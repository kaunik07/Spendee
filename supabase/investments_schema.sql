-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS investments (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('stocks', '401k', 'mutual_funds')),
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date                DATE        NOT NULL,
  note                TEXT        DEFAULT '',
  is_recurring        BOOLEAN     DEFAULT false,
  recurring_frequency TEXT        CHECK (recurring_frequency IN ('weekly', 'biweekly', 'monthly')),
  next_due_date       DATE,
  created_at          BIGINT      NOT NULL
);

-- Row Level Security
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own investments"
  ON investments FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS investments_user_date_idx ON investments (user_id, date DESC);
