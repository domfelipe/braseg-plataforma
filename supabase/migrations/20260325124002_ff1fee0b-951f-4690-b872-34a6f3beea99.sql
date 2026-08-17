
CREATE TABLE public.clock_qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(token),
  UNIQUE(user_id, company_id)
);

ALTER TABLE public.clock_qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage QR tokens"
ON public.clock_qr_tokens FOR ALL
TO authenticated
USING (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id))
WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id));

CREATE POLICY "Service role can read QR tokens"
ON public.clock_qr_tokens FOR SELECT
TO service_role
USING (true);
