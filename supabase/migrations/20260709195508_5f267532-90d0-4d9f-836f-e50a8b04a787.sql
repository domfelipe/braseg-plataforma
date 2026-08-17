
-- ============================================================
-- Backfill Fase 3.5: reclassificação determinística com auditoria
-- ============================================================

-- 1) Tabela de auditoria (append-only)
CREATE TABLE IF NOT EXISTS public.financial_backfill_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  company_id uuid,
  batch text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.financial_backfill_audit TO authenticated;
GRANT ALL ON public.financial_backfill_audit TO service_role;
ALTER TABLE public.financial_backfill_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master can read backfill audit" ON public.financial_backfill_audit;
CREATE POLICY "Master can read backfill audit"
  ON public.financial_backfill_audit FOR SELECT
  TO authenticated
  USING (public.is_master(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_fba_tx ON public.financial_backfill_audit(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fba_batch ON public.financial_backfill_audit(batch);

-- 2) Snapshot de invariantes ANTES
DO $$
DECLARE
  _before_rows int;
  _before_sum jsonb;
  _after_rows int;
  _after_sum jsonb;
  _batch text := 'phase-3.5-' || to_char(now(), 'YYYYMMDDHH24MISS');
BEGIN
  SELECT count(*) INTO _before_rows FROM public.financial_transactions;
  SELECT jsonb_agg(row_to_json(t)) INTO _before_sum FROM (
    SELECT company_id, type, status, sum(round(amount * 100)::bigint) AS cents, count(*) AS n
      FROM public.financial_transactions
     GROUP BY 1,2,3
     ORDER BY 1,2,3
  ) t;

  -- 3) Backfill de CITY (13 linhas)
  WITH candidates AS (
    SELECT id, company_id, city AS old_city,
           public.infer_financial_city_from_message(company_id, public.extract_whatsapp_message(notes)) AS new_city
      FROM public.financial_transactions
     WHERE (notes ILIKE '%Mensagem do contato:%' OR attachment_url ILIKE '%/receipts/%')
       AND city IS NULL
  ),
  applied AS (
    UPDATE public.financial_transactions ft
       SET city = c.new_city,
           updated_at = now()
      FROM candidates c
     WHERE ft.id = c.id
       AND c.new_city IS NOT NULL
       AND ft.city IS NULL
    RETURNING ft.id, ft.company_id, c.old_city, ft.city AS new_city
  )
  INSERT INTO public.financial_backfill_audit
    (transaction_id, company_id, batch, field, old_value, new_value, reason)
  SELECT id, company_id, _batch, 'city', old_city, new_city,
         'infer_financial_city_from_message'
    FROM applied;

  -- 4) Backfill de CATEGORY (26 linhas)
  WITH candidates AS (
    SELECT id, company_id, category_id AS old_cat,
           public.infer_financial_category_name(public.extract_whatsapp_message(notes)) AS cat_name,
           type
      FROM public.financial_transactions
     WHERE (notes ILIKE '%Mensagem do contato:%' OR attachment_url ILIKE '%/receipts/%')
       AND category_id IS NULL
  ),
  resolved AS (
    SELECT id, company_id, old_cat, cat_name,
           public.upsert_financial_category(company_id, cat_name, type) AS new_cat_id
      FROM candidates
     WHERE cat_name IS NOT NULL
  ),
  applied AS (
    UPDATE public.financial_transactions ft
       SET category_id = r.new_cat_id,
           updated_at = now()
      FROM resolved r
     WHERE ft.id = r.id
       AND r.new_cat_id IS NOT NULL
       AND ft.category_id IS NULL
    RETURNING ft.id, ft.company_id, r.old_cat, ft.category_id AS new_cat_id, r.cat_name
  )
  INSERT INTO public.financial_backfill_audit
    (transaction_id, company_id, batch, field, old_value, new_value, reason)
  SELECT id, company_id, _batch, 'category_id',
         old_cat::text, new_cat_id::text,
         'infer_financial_category_name -> ' || cat_name
    FROM applied;

  -- 5) Corrigir 175735d2-… (pago sem payment_date)
  WITH target AS (
    SELECT id, company_id, status, payment_date, due_date
      FROM public.financial_transactions
     WHERE id = '175735d2-ebf0-4410-acea-62ef79ac4b5e'
       AND status = 'pago'
       AND payment_date IS NULL
  ),
  applied AS (
    UPDATE public.financial_transactions ft
       SET payment_date = t.due_date,
           notes = COALESCE(ft.notes, '') || E'\n[Backfill] payment_date preenchido = due_date. Confirmar manualmente.',
           updated_at = now()
      FROM target t
     WHERE ft.id = t.id
    RETURNING ft.id, ft.company_id, t.payment_date AS old_pd, ft.payment_date AS new_pd
  )
  INSERT INTO public.financial_backfill_audit
    (transaction_id, company_id, batch, field, old_value, new_value, reason)
  SELECT id, company_id, _batch, 'payment_date',
         NULL, new_pd::text,
         'pago sem payment_date; preenchido com due_date (warning)'
    FROM applied;

  -- 6) Verificar invariantes DEPOIS
  SELECT count(*) INTO _after_rows FROM public.financial_transactions;
  SELECT jsonb_agg(row_to_json(t)) INTO _after_sum FROM (
    SELECT company_id, type, status, sum(round(amount * 100)::bigint) AS cents, count(*) AS n
      FROM public.financial_transactions
     GROUP BY 1,2,3
     ORDER BY 1,2,3
  ) t;

  IF _before_rows <> _after_rows THEN
    RAISE EXCEPTION 'INVARIANT FAIL: row count % -> %', _before_rows, _after_rows;
  END IF;
  IF _before_sum::text <> _after_sum::text THEN
    RAISE EXCEPTION 'INVARIANT FAIL: sums/counts per (company,type,status) changed. Antes=%, Depois=%',
      _before_sum, _after_sum;
  END IF;

  RAISE NOTICE 'Backfill % OK. Rows=%, invariantes preservados.', _batch, _after_rows;
END $$;
