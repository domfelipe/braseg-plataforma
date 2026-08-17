
-- Fase 1: Schema canônico de proveniência + staging + view enriquecida

CREATE TABLE IF NOT EXISTS public.financial_source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id uuid NULL REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('chatwoot','legacy','whatsapp','upload','manual')),
  chatwoot_account_id bigint NULL,
  conversation_id bigint NULL,
  attachment_message_id bigint NULL,
  caption_message_id bigint NULL,
  source_key text NOT NULL,
  document_sha256 text NULL CHECK (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text NULL,
  storage_path text NULL,
  original_filename text NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL,
  attachment_status text NOT NULL DEFAULT 'pending_migration'
    CHECK (attachment_status IN ('pending_migration','downloading','stored','blocked_missing_secret','source_unavailable','invalid_mime','too_large','failed')),
  processing_status text NOT NULL DEFAULT 'needs_review'
    CHECK (processing_status IN ('needs_review','ready','processing','processed','duplicate_candidate','duplicate_confirmed','failed')),
  duplicate_of_document_id uuid NULL REFERENCES public.financial_source_documents(id) ON DELETE SET NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fsd_company_source_key_uniq
  ON public.financial_source_documents (company_id, source_key);
CREATE UNIQUE INDEX IF NOT EXISTS fsd_company_sha256_uniq
  ON public.financial_source_documents (company_id, document_sha256)
  WHERE document_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS fsd_tx_idx ON public.financial_source_documents (transaction_id);
CREATE INDEX IF NOT EXISTS fsd_attstatus_idx ON public.financial_source_documents (attachment_status);
CREATE INDEX IF NOT EXISTS fsd_procstatus_idx ON public.financial_source_documents (processing_status);
CREATE INDEX IF NOT EXISTS fsd_conv_idx ON public.financial_source_documents (conversation_id, attachment_message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_source_documents TO authenticated;
GRANT ALL ON public.financial_source_documents TO service_role;

ALTER TABLE public.financial_source_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsd_select" ON public.financial_source_documents FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fsd_insert" ON public.financial_source_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fsd_update" ON public.financial_source_documents FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fsd_delete" ON public.financial_source_documents FOR DELETE TO authenticated
  USING (public.is_master(auth.uid()));

CREATE TRIGGER trg_fsd_updated_at BEFORE UPDATE ON public.financial_source_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staging para documentos sem valor / em revisão
CREATE TABLE IF NOT EXISTS public.financial_document_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL UNIQUE REFERENCES public.financial_source_documents(id) ON DELETE CASCADE,
  legacy_transaction_id uuid NULL REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  extracted_amount numeric(14,2) NULL,
  extracted_due_date date NULL,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review','processing','processed','failed','discarded')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  last_error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS fds_company_idx ON public.financial_document_staging (company_id, status);
CREATE INDEX IF NOT EXISTS fds_legacy_tx_idx ON public.financial_document_staging (legacy_transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_document_staging TO authenticated;
GRANT ALL ON public.financial_document_staging TO service_role;

ALTER TABLE public.financial_document_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fds_select" ON public.financial_document_staging FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fds_insert" ON public.financial_document_staging FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fds_update" ON public.financial_document_staging FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "fds_delete" ON public.financial_document_staging FOR DELETE TO authenticated
  USING (public.is_master(auth.uid()));

CREATE TRIGGER trg_fds_updated_at BEFORE UPDATE ON public.financial_document_staging
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Snapshot monetário Fase 0 (imutável)
CREATE TABLE IF NOT EXISTS public.financial_snapshot_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  company_id uuid NULL,
  metric text NOT NULL,
  count_value bigint NULL,
  amount_value numeric(16,2) NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fsa_batch_idx ON public.financial_snapshot_audit (batch);

GRANT SELECT, INSERT ON public.financial_snapshot_audit TO authenticated;
GRANT ALL ON public.financial_snapshot_audit TO service_role;

ALTER TABLE public.financial_snapshot_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsa_select_master" ON public.financial_snapshot_audit FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()));
CREATE POLICY "fsa_insert_master" ON public.financial_snapshot_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_master(auth.uid()));

-- Snapshot Fase 0
-- [LGPD] dados de producao removidos na limpeza do fork Braseg


-- [LGPD] dados de producao removidos na limpeza do fork Braseg


-- Backfill dos 23: proveniência estruturada preservando file_hash legado
-- Mapeamento perfil→conversation_id: Alice=3, Milena=2 (conforme briefing)
-- [LGPD] dados de producao removidos na limpeza do fork Braseg
 bytes nao baixados; SHA-256 real nao calculado',
    'legacy_file_hash', ft.file_hash
  )
FROM public.financial_transactions ft
WHERE ft.file_hash LIKE 'src:chatwoot:%'
ON CONFLICT (company_id, source_key) DO NOTHING;

-- Auditoria da fase 1
-- [LGPD] dados de producao removidos na limpeza do fork Braseg
 bytes/SHA-256 pendentes de secret Chatwoot'
FROM public.financial_transactions ft
WHERE ft.file_hash LIKE 'src:chatwoot:%';

-- Staging dos 6 placeholders existentes com amount<=0
WITH placeholders AS (
  SELECT ft.id, ft.company_id
  FROM public.financial_transactions ft
  WHERE ft.amount <= 0
), docs AS (
  -- [LGPD] dados de producao removidos na limpeza do fork Braseg


-- View canônica enriquecida com security_invoker
CREATE OR REPLACE VIEW public.v_financial_transactions_enriched
WITH (security_invoker = true) AS
SELECT
  ft.*,
  fsd.id AS source_document_id,
  fsd.source_type,
  fsd.source_key,
  fsd.attachment_status,
  fsd.processing_status,
  (fsd.storage_path IS NOT NULL) AS has_persistent_attachment,
  (fsd.document_sha256 IS NOT NULL) AS has_real_sha256,
  (fsd.processing_status IN ('duplicate_candidate','duplicate_confirmed')) AS is_possible_duplicate,
  (
    fsd.source_type = 'chatwoot'
    OR ft.file_hash LIKE 'src:chatwoot:%'
    OR ft.notes ILIKE '%Mensagem do contato:%'
    OR ft.attachment_url ILIKE '%receipts/%'
  ) AS is_whatsapp_import,
  (
    fsd.processing_status = 'needs_review'
    OR EXISTS (SELECT 1 FROM public.financial_document_staging s WHERE s.legacy_transaction_id = ft.id AND s.status='needs_review')
  ) AS needs_review
FROM public.financial_transactions ft
LEFT JOIN public.financial_source_documents fsd ON fsd.transaction_id = ft.id;

GRANT SELECT ON public.v_financial_transactions_enriched TO authenticated;
GRANT SELECT ON public.v_financial_transactions_enriched TO service_role;

-- Guardrail: bloquear novos inserts com amount<=0 vindos do fluxo WhatsApp,
-- exceto quando ja possuem staging vinculado ou vem do sync legado (source_payment_id).
CREATE OR REPLACE FUNCTION public.tg_block_zero_amount_whatsapp()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.amount > 0 THEN RETURN NEW; END IF;
  IF NEW.source_payment_id IS NOT NULL THEN RETURN NEW; END IF; -- espelho de professional_payments
  IF NEW.file_hash IS NULL OR NEW.file_hash NOT LIKE 'src:chatwoot:%' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'financial_transactions: amount<=0 vindo do WhatsApp deve ir para financial_document_staging (source_key=%)', NEW.file_hash
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_zero_amount_whatsapp ON public.financial_transactions;
CREATE TRIGGER trg_block_zero_amount_whatsapp
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_zero_amount_whatsapp();
