
-- 1) Inbox de documentos sem empresa identificada
CREATE TABLE IF NOT EXISTS public.financial_unassigned_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  document_sha256 text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'receipts',
  storage_path text NOT NULL,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  source_type text NOT NULL DEFAULT 'whatsapp',
  chatwoot_account_id bigint,
  conversation_id bigint,
  message_id bigint,
  payer_cnpj text,
  payer_name text,
  extracted_amount numeric,
  extracted_due_date date,
  extracted_payment_date date,
  extracted_description text,
  reason text,
  status text NOT NULL DEFAULT 'needs_review',
  promoted_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT fud_status_check CHECK (status = ANY (ARRAY['needs_review','assigned','promoted','discarded','duplicate'])),
  CONSTRAINT fud_sha_check CHECK (document_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS fud_sha_unique ON public.financial_unassigned_documents (document_sha256);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_unassigned_documents TO authenticated;
GRANT ALL ON public.financial_unassigned_documents TO service_role;

ALTER TABLE public.financial_unassigned_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage unassigned documents"
  ON public.financial_unassigned_documents FOR ALL TO authenticated
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

CREATE TRIGGER trg_fud_updated_at BEFORE UPDATE ON public.financial_unassigned_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Helper de acesso por pasta company_id
CREATE OR REPLACE FUNCTION public.can_access_company_folder(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE _c uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  BEGIN
    _c := ((storage.foldername(_name))[1])::uuid;
  EXCEPTION WHEN others THEN
    RETURN public.is_master(auth.uid());
  END;
  IF _c IS NULL THEN RETURN public.is_master(auth.uid()); END IF;
  RETURN public.has_company_access(auth.uid(), _c);
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_company_folder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_company_folder(text) TO authenticated, service_role;

-- 3) Remover políticas amplas
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Users can view employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete employee documents" ON storage.objects;

-- 4) Políticas least-privilege por empresa
CREATE POLICY "Company members read financial docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('receipts','invoices','employee-documents')
         AND public.can_access_company_folder(name));

CREATE POLICY "Company members write financial docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('receipts','invoices','employee-documents')
              AND public.can_access_company_folder(name));

CREATE POLICY "Company members update financial docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('receipts','invoices','employee-documents')
         AND public.can_access_company_folder(name))
  WITH CHECK (bucket_id IN ('receipts','invoices','employee-documents')
              AND public.can_access_company_folder(name));

CREATE POLICY "Company members delete financial docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('receipts','invoices','employee-documents')
         AND public.can_access_company_folder(name));

-- 5) Service role para edge functions
CREATE POLICY "Service role manages financial docs"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id IN ('receipts','invoices','employee-documents'))
  WITH CHECK (bucket_id IN ('receipts','invoices','employee-documents'));
