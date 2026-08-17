
CREATE TABLE IF NOT EXISTS public.payment_professional_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name_key TEXT NOT NULL,
  doctor_name_original TEXT NOT NULL,
  phone TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_ppc_company_key ON public.payment_professional_contacts (company_id, name_key);

ALTER TABLE public.payment_professional_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts for their companies"
  ON public.payment_professional_contacts FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert contacts for their companies"
  ON public.payment_professional_contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update contacts for their companies"
  ON public.payment_professional_contacts FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete contacts for their companies"
  ON public.payment_professional_contacts FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE TRIGGER trg_ppc_updated_at
  BEFORE UPDATE ON public.payment_professional_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
