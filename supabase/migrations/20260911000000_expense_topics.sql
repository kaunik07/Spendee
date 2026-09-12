-- Expense Topics — group existing expenses under a user-created label
-- ("Trip to New York", "Moving Cost") to see total spend and a category
-- breakdown for that group, independent of each expense's own category.
--
-- A topic is purely a many-to-many TAG over expenses that already exist —
-- nothing about how an expense is entered, categorized, or synced changes.
-- No new RPC: every write here is a plain insert/update/delete through the
-- existing generic store/syncQueue.ts op types (see that file's `apply()`),
-- because there's no balance to move and no cross-table invariant to
-- protect transactionally — unlike import_statement_expenses, which needed
-- SECURITY DEFINER specifically because it also moves an account/card
-- balance in the same transaction as the expense insert.

CREATE TABLE IF NOT EXISTS public.topics (
  id            UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          TEXT           NOT NULL,
  note          TEXT           NOT NULL DEFAULT '',
  icon          TEXT           NOT NULL DEFAULT '🗂️',   -- a single emoji, free text
  target_amount NUMERIC(12, 2) DEFAULT NULL,
  date_start    TEXT           DEFAULT NULL,             -- YYYY-MM-DD, display context only
  date_end      TEXT           DEFAULT NULL,
  archived      BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at    BIGINT         NOT NULL
);

-- Many-to-many: one expense can belong to multiple topics, one topic holds
-- many expenses. ON DELETE CASCADE on BOTH foreign keys is load-bearing —
-- deleting an expense anywhere else in the app (the existing delete flow in
-- useExpenses.ts is completely unmodified) automatically drops its
-- topic_expenses rows with no app-side cleanup code, and deleting a topic
-- drops its memberships the same way. Cascade only flows from the deleted
-- row's own FK direction: deleting an expense never deletes a topic, and
-- vice versa.
CREATE TABLE IF NOT EXISTS public.topic_expenses (
  id         UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id   UUID   REFERENCES public.topics(id)   ON DELETE CASCADE NOT NULL,
  expense_id UUID   REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID   REFERENCES auth.users(id)       ON DELETE CASCADE NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (topic_id, expense_id)
);

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE public.topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_expenses  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "topics_own" ON public.topics;
CREATE POLICY "topics_own" ON public.topics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- WITH CHECK also verifies that expense_id/topic_id actually reference rows
-- owned by the same caller — auth.uid() = user_id alone only constrains the
-- user_id column on the row being inserted, so without these EXISTS clauses
-- a client could insert {user_id: me, topic_id: my own topic, expense_id:
-- someone else's expense}: the FK to public.expenses(id) only requires the
-- row to exist, not that the inserter owns it.
DROP POLICY IF EXISTS "topic_expenses_own" ON public.topic_expenses;
CREATE POLICY "topic_expenses_own" ON public.topic_expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND t.user_id = auth.uid())
  );

-- ── Realtime ──────────────────────────────────────────────
-- ALTER PUBLICATION ... ADD TABLE errors (42710) if the table is already a
-- publication member, so re-running this migration would fail without the
-- guard — same idempotency concern as the CREATE POLICY statements above.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.topics, public.topic_expenses;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_topics_user            ON public.topics(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_expenses_topic    ON public.topic_expenses(topic_id);
-- Used by the "in N topics" tag on the Add-Expenses picker — a lookup FROM
-- an expense id TO the topics it already belongs to, the opposite direction
-- of the topic-detail page's own lookup (which goes through idx above).
CREATE INDEX IF NOT EXISTS idx_topic_expenses_expense  ON public.topic_expenses(expense_id);
