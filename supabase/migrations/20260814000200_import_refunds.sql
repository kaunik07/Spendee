-- Statement import — support refund rows (a merchant reversing an earlier
-- purchase, imported as a negative expense — see lib/statement/refund.ts).
--
-- expenses.amount already allows any sign (no CHECK constraint — see
-- 20260721000000_initial_schema.sql). account_transactions and
-- credit_card_transactions are different: both have CHECK (amount > 0) and
-- carry direction via `type` ('deposit'/'withdrawal', 'charge'/'payment')
-- instead of sign — the same convention the manual Add/Edit Expense forms
-- already use for a directly-logged refund (components/AddExpenseSheet.tsx).
--
-- The previous version of this RPC hardcoded type='withdrawal'/'charge' and
-- inserted p_txns' amount as-is. A refund row (amount < 0) would have
-- either violated the positive-amount CHECK outright, or if it slipped
-- through, meant a "withdrawal" of a negative amount — nonsense that reads
-- backwards in the ledger. Fixed here: each linked txn row's own sign picks
-- its type (negative -> the deposit/payment side) and stores abs(amount);
-- v_delta's math was already sign-agnostic (SUM over signed amounts), so it
-- needs no change — a refund naturally nets against the sum.

CREATE OR REPLACE FUNCTION public.import_statement_expenses(
  p_import_id    UUID,
  p_source_file  TEXT,
  p_file_sha256  TEXT,
  p_period_start TEXT,
  p_period_end   TEXT,
  p_payment_type TEXT,     -- NULL | 'bank_account' | 'credit_card'
  p_source_id    UUID,     -- NULL | account id | card id
  p_balance_op   UUID,
  p_expenses     JSONB,    -- [{id,name,amount,category,note,date,created_at,subcategory,details,import_fingerprint,linked_transaction_id}]
  p_txns         JSONB     -- [{id,amount,note,date,created_at}] — amount signed; empty when unlinked
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

  IF v_total > 500 THEN
    RAISE EXCEPTION 'too many rows in one import (% > 500)', v_total;
  END IF;

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
      details               JSONB,
      import_fingerprint    TEXT,
      linked_transaction_id UUID
    )
  ),
  ins AS (
    INSERT INTO expenses (
      id, user_id, name, amount, category, note, date, created_at,
      subcategory, details, payment_type, payment_source_id, linked_transaction_id,
      import_id, import_fingerprint
    )
    SELECT s.id, v_uid, s.name, s.amount, s.category, COALESCE(s.note, ''),
           s.date, s.created_at, s.subcategory, s.details, p_payment_type, p_source_id,
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

  -- type flips per row on its own sign: a refund (amount < 0) posts as the
  -- money-back side (deposit / payment) with the positive magnitude stored —
  -- same convention AddExpenseSheet.tsx uses for a manually-logged refund.
  IF p_payment_type = 'bank_account' AND array_length(v_linked, 1) > 0 THEN
    INSERT INTO account_transactions (id, account_id, user_id, type, amount, note, date, created_at)
    SELECT t.id, p_source_id, v_uid,
           CASE WHEN t.amount < 0 THEN 'deposit' ELSE 'withdrawal' END,
           abs(t.amount), COALESCE(t.note, ''), t.date, t.created_at
    FROM jsonb_to_recordset(p_txns) AS t(id UUID, amount NUMERIC, note TEXT, date TEXT, created_at BIGINT)
    WHERE t.id = ANY(v_linked)
    ON CONFLICT (id) DO NOTHING;

  ELSIF p_payment_type = 'credit_card' AND array_length(v_linked, 1) > 0 THEN
    INSERT INTO credit_card_transactions (id, card_id, user_id, type, amount, note, date, created_at)
    SELECT t.id, p_source_id, v_uid,
           CASE WHEN t.amount < 0 THEN 'payment' ELSE 'charge' END,
           abs(t.amount), COALESCE(t.note, ''), t.date, t.created_at
    FROM jsonb_to_recordset(p_txns) AS t(id UUID, amount NUMERIC, note TEXT, date TEXT, created_at BIGINT)
    WHERE t.id = ANY(v_linked)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Unchanged, and correctly sign-agnostic already: v_sum is a SUM over
  -- signed amounts, so a refund inside the batch naturally nets out here —
  -- no separate branch needed for it.
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
