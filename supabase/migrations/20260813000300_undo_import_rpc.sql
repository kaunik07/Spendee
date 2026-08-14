-- Statement import — undo.
--
-- The reversing counterpart to import_statement_expenses. A client-side undo
-- would need to SELECT the expenses for their linked_transaction_id, DELETE
-- the ledger rows, DELETE the expenses, then reverse the balance — four
-- round trips with a race between any two of them (another device's write
-- landing mid-sequence, or the request dying partway and leaving ledger rows
-- orphaned or a balance unreversed). One function closes all of that the same
-- way the commit does: it either fully happens or it doesn't happen at all.

-- Marks an import as undone (and by which reversing op), so "Undo" can be
-- hidden or disabled once it's already happened and the function below's
-- second call can short-circuit cleanly instead of re-deriving state.
ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS undone_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS undo_op_id UUID        DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.undo_statement_import(p_import_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_imp   RECORD;
  v_undo_op UUID;
  v_deleted INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_imp FROM statement_imports
  WHERE id = p_import_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found';
  END IF;

  -- Deleting an already-undone import is a no-op, not an error — the button
  -- can be tapped twice (a slow network, a double click) without consequence.
  IF v_imp.undone_at IS NOT NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'reversed_delta', 0, 'already_undone', true);
  END IF;

  -- Ledger rows first, while the expenses (which carry linked_transaction_id)
  -- still exist to find them by.
  IF v_imp.payment_type = 'bank_account' THEN
    DELETE FROM account_transactions
    WHERE id IN (SELECT linked_transaction_id FROM expenses WHERE import_id = p_import_id AND linked_transaction_id IS NOT NULL)
      AND user_id = v_uid;
  ELSIF v_imp.payment_type = 'credit_card' THEN
    DELETE FROM credit_card_transactions
    WHERE id IN (SELECT linked_transaction_id FROM expenses WHERE import_id = p_import_id AND linked_transaction_id IS NOT NULL)
      AND user_id = v_uid;
  END IF;

  DELETE FROM expenses WHERE import_id = p_import_id AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Reverse exactly the delta the commit actually applied — not a fresh sum
  -- over what's left, which a partial prior duplicate-skip would already have
  -- made different from the naive "sum every row" figure.
  v_undo_op := gen_random_uuid();
  IF v_imp.applied_delta <> 0 THEN
    INSERT INTO applied_ops(op_id, user_id) VALUES (v_undo_op, v_uid) ON CONFLICT (op_id) DO NOTHING;
    IF FOUND THEN
      IF v_imp.payment_type = 'bank_account' THEN
        UPDATE bank_accounts SET balance = balance - v_imp.applied_delta
        WHERE id = v_imp.payment_source_id AND user_id = v_uid;
      ELSIF v_imp.payment_type = 'credit_card' THEN
        UPDATE credit_cards SET outstanding_balance = outstanding_balance - v_imp.applied_delta
        WHERE id = v_imp.payment_source_id AND user_id = v_uid;
      END IF;
    END IF;
  END IF;

  UPDATE statement_imports SET undone_at = now(), undo_op_id = v_undo_op WHERE id = p_import_id;

  RETURN jsonb_build_object('deleted', v_deleted, 'reversed_delta', v_imp.applied_delta, 'already_undone', false);
END; $$;

REVOKE EXECUTE ON FUNCTION public.undo_statement_import(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_statement_import(UUID) TO authenticated;
