-- Offline-first sync engine support.
-- 1) applied_ops: idempotency ledger so a replayed balance op applies exactly once.
-- 2) adjust_*_balance RPCs: apply a balance DELTA server-side (composable + safe
--    under concurrent multi-device writes), guarded by the op id.

CREATE TABLE IF NOT EXISTS public.applied_ops (
  op_id      UUID        PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applied_ops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "applied_ops_own" ON public.applied_ops;
CREATE POLICY "applied_ops_own" ON public.applied_ops
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.adjust_account_balance(p_account UUID, p_delta NUMERIC, p_op UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO applied_ops(op_id, user_id) VALUES (p_op, auth.uid()) ON CONFLICT (op_id) DO NOTHING;
  IF FOUND THEN
    UPDATE bank_accounts SET balance = balance + p_delta WHERE id = p_account AND user_id = auth.uid();
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_card_balance(p_card UUID, p_delta NUMERIC, p_op UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO applied_ops(op_id, user_id) VALUES (p_op, auth.uid()) ON CONFLICT (op_id) DO NOTHING;
  IF FOUND THEN
    UPDATE credit_cards SET outstanding_balance = outstanding_balance + p_delta WHERE id = p_card AND user_id = auth.uid();
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.adjust_account_balance(UUID, NUMERIC, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_card_balance(UUID, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.adjust_account_balance(UUID, NUMERIC, UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.adjust_card_balance(UUID, NUMERIC, UUID) TO authenticated;
