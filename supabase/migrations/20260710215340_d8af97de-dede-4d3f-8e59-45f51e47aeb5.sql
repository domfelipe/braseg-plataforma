-- Bloco B: RPCs de conciliação transacional + coluna metadata em audit
ALTER TABLE public.financial_backfill_audit ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.financial_backfill_audit ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.financial_backfill_audit ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE OR REPLACE FUNCTION public.mark_transaction_paid(
  _transaction_id uuid, _payment_date date, _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _tx record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_master(_uid) THEN RAISE EXCEPTION 'Somente master/super-admin' USING ERRCODE = '42501'; END IF;
  IF _payment_date IS NULL THEN RAISE EXCEPTION 'payment_date obrigatorio'; END IF;

  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _transaction_id FOR UPDATE;
  IF _tx.id IS NULL THEN RAISE EXCEPTION 'Transacao nao encontrada'; END IF;
  IF _tx.status = 'pago' THEN
    RAISE EXCEPTION 'Transacao ja esta paga (id=%). Use reverse_transaction_payment antes de reprocessar.', _transaction_id
      USING ERRCODE = '55000';
  END IF;
  IF _tx.status = 'cancelado' THEN RAISE EXCEPTION 'Transacao cancelada nao pode ser marcada como paga'; END IF;

  UPDATE public.financial_transactions
     SET status = 'pago', payment_date = _payment_date, updated_at = now()
   WHERE id = _transaction_id;

  INSERT INTO public.financial_backfill_audit
    (transaction_id, company_id, batch, field, old_value, new_value, reason, action, user_id, metadata)
  VALUES
    (_transaction_id, _tx.company_id, 'admin-drawer', 'status', _tx.status, 'pago',
     COALESCE(_notes, 'Marcado como pago via drawer'), 'mark_paid', _uid,
     jsonb_build_object('old_payment_date', _tx.payment_date, 'new_payment_date', _payment_date));

  RETURN jsonb_build_object('ok', true, 'transaction_id', _transaction_id, 'status', 'pago');
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_transaction_payment(
  _transaction_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _tx record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_master(_uid) THEN RAISE EXCEPTION 'Somente master/super-admin' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'Motivo obrigatorio'; END IF;

  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _transaction_id FOR UPDATE;
  IF _tx.id IS NULL THEN RAISE EXCEPTION 'Transacao nao encontrada'; END IF;
  IF _tx.status <> 'pago' THEN
    RAISE EXCEPTION 'Somente transacoes pagas podem ser revertidas (status atual=%).', _tx.status
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.financial_transactions
     SET status = 'pendente', payment_date = NULL, updated_at = now()
   WHERE id = _transaction_id;

  INSERT INTO public.financial_backfill_audit
    (transaction_id, company_id, batch, field, old_value, new_value, reason, action, user_id, metadata)
  VALUES
    (_transaction_id, _tx.company_id, 'admin-drawer', 'status', _tx.status, 'pendente',
     _reason, 'reverse_paid', _uid,
     jsonb_build_object('reverted_payment_date', _tx.payment_date));

  RETURN jsonb_build_object('ok', true, 'transaction_id', _transaction_id, 'status', 'pendente');
END; $$;

REVOKE ALL ON FUNCTION public.mark_transaction_paid(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_transaction_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_transaction_paid(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction_payment(uuid, text) TO authenticated;