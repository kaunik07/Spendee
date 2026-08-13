-- Statement import — the bulk commit.
-- Split from the table migration because a function is re-applied far more
-- often than the schema it operates on: this file is safe to replay on its own.

-- ── The bulk commit ───────────────────────────────────────
-- Everything in one function, and therefore one transaction, because the
-- alternative splits badly: the client array-upserts the expenses, then calls
-- adjust_*_balance, and a failure between the two leaves rows inserted with the
-- balance never moved and nothing to reconcile against. Here that state cannot
-- exist. The per-op path in store/syncQueue.ts can't carry this either — it
-- replays serially and rewrites the whole queue per op, so 200 linked rows
-- would be ~600 sequential round-trips.
--
-- Idempotent on every axis, so a timed-out request is safe to retry verbatim:
-- expense rows collide on import_fingerprint, the balance move is guarded by
-- applied_ops, and the bookkeeping row collides on its primary key.
CREATE OR REPLACE FUNCTION public.import_statement_expenses(
  p_import_id    UUID,
  p_source_file  TEXT,
  p_file_sha256  TEXT,
  p_period_start TEXT,
  p_period_end   TEXT,
  p_payment_type TEXT,     -- NULL | 'bank_account' | 'credit_card'
  p_source_id    UUID,     -- NULL | account id | card id
  p_balance_op   UUID,
  p_expenses     JSONB,    -- [{id,name,amount,category,note,date,created_at,subcategory,import_fingerprint,linked_transaction_id}]
  p_txns         JSONB     -- [{id,amount,note,date,created_at}] — empty when unlinked
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID    := auth.uid();
  v_total    INT     := COALESCE(jsonb_array_length(p_expenses), 0);
  v_inserted INT     := 0;
  v_sum      NUMERIC := 0;
  v_delta    NUMERIC := 0;
  v_linked   UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Bounded so one request can't balloon past PostgREST's payload limits; the
  -- parser rejects anything larger with too_many_rows before we get here.
  IF v_total > 500 THEN
    RAISE EXCEPTION 'too many rows in one import (% > 500)', v_total;
  END IF;

  -- SECURITY DEFINER bypasses RLS, so p_source_id is untrusted input until it
  -- has been matched to this user. Without this a caller could move someone
  -- else's balance.
  IF p_payment_type = 'bank_account' THEN
    IF NOT EXISTS (SELECT 1 FROM bank_accounts WHERE id = p_source_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'bank account not found';
    END IF;
  ELSIF p_payment_type = 'credit_card' THEN
    IF NOT EXISTS (SELECT 1 FROM credit_cards WHERE id = p_source_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'credit card not found';
    END IF;
  ELSIF p_payment_type IS NOT NULL THEN
    RAISE EXCEPTION 'unknown payment type %', p_payment_type;
  END IF;

  -- Insert the expenses, dropping any whose fingerprint this user already has.
  -- Capture what actually landed: the sum drives the balance move and the
  -- linked ids decide which ledger transactions to write, so a partially
  -- duplicate re-import adjusts by exactly the new amount and leaves no
  -- orphan transaction rows behind.
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(p_expenses) AS x(
      id                    UUID,
      name                  TEXT,
      amount                NUMERIC,
      category              TEXT,
      note                  TEXT,
      date                  TEXT,
      created_at            BIGINT,
      subcategory           TEXT,
      import_fingerprint    TEXT,
      linked_transaction_id UUID
    )
  ),
  ins AS (
    INSERT INTO expenses (
      id, user_id, name, amount, category, note, date, created_at,
      subcategory, payment_type, payment_source_id, linked_transaction_id,
      import_id, import_fingerprint
    )
    SELECT s.id, v_uid, s.name, s.amount, s.category, COALESCE(s.note, ''),
           s.date, s.created_at, s.subcategory, p_payment_type, p_source_id,
           s.linked_transaction_id, p_import_id, s.import_fingerprint
    FROM src s
    ON CONFLICT (user_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL
    DO NOTHING
    RETURNING id, amount, linked_transaction_id
  )
  SELECT COUNT(*),
         COALESCE(SUM(amount), 0),
         COALESCE(array_remove(array_agg(linked_transaction_id), NULL), '{}')
    INTO v_inserted, v_sum, v_linked
  FROM ins;

  -- Mirror each inserted expense into the account/card ledger.
  IF p_payment_type = 'bank_account' AND array_length(v_linked, 1) > 0 THEN
    INSERT INTO account_transactions (id, account_id, user_id, type, amount, note, date, created_at)
    SELECT t.id, p_source_id, v_uid, 'withdrawal', t.amount, COALESCE(t.note, ''), t.date, t.created_at
    FROM jsonb_to_recordset(p_txns) AS t(id UUID, amount NUMERIC, note TEXT, date TEXT, created_at BIGINT)
    WHERE t.id = ANY(v_linked)
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_payment_type = 'credit_card' AND array_length(v_linked, 1) > 0 THEN
    INSERT INTO credit_card_transactions (id, card_id, user_id, type, amount, note, date, created_at)
    SELECT t.id, p_source_id, v_uid, 'charge', t.amount, COALESCE(t.note, ''), t.date, t.created_at
    FROM jsonb_to_recordset(p_txns) AS t(id UUID, amount NUMERIC, note TEXT, date TEXT, created_at BIGINT)
    WHERE t.id = ANY(v_linked)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- One balance move for the whole import, summed from the rows that actually
  -- landed. Sign follows AddExpenseSheet: spending lowers a bank balance and
  -- raises what's owed on a card. Guarded by applied_ops exactly like
  -- adjust_account_balance, so a retry can't apply it twice.
  IF p_payment_type = 'bank_account' THEN
    v_delta := -v_sum;
  ELSIF p_payment_type = 'credit_card' THEN
    v_delta := v_sum;
  END IF;

  IF v_delta <> 0 THEN
    INSERT INTO applied_ops(op_id, user_id) VALUES (p_balance_op, v_uid)
    ON CONFLICT (op_id) DO NOTHING;

    IF FOUND THEN
      IF p_payment_type = 'bank_account' THEN
        UPDATE bank_accounts SET balance = balance + v_delta
        WHERE id = p_source_id AND user_id = v_uid;
      ELSE
        UPDATE credit_cards SET outstanding_balance = outstanding_balance + v_delta
        WHERE id = p_source_id AND user_id = v_uid;
      END IF;
    ELSE
      -- Already applied by an earlier attempt at this same import.
      v_delta := 0;
    END IF;
  END IF;

  INSERT INTO statement_imports (
    id, user_id, source_file, file_sha256, period_start, period_end,
    payment_type, payment_source_id, row_count, inserted_count, skipped_count,
    applied_delta, balance_op_id
  ) VALUES (
    p_import_id, v_uid, COALESCE(p_source_file, ''), p_file_sha256,
    p_period_start, p_period_end, p_payment_type, p_source_id,
    v_total, v_inserted, v_total - v_inserted, v_delta, p_balance_op
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'inserted',      v_inserted,
    'skipped',       v_total - v_inserted,
    'applied_delta', v_delta
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.import_statement_expenses(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.import_statement_expenses(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB, JSONB) TO authenticated;
