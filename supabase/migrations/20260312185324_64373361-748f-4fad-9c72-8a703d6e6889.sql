
CREATE TABLE public.clock_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  professional_name text NOT NULL,
  professional_cpf_cnpj text,
  professional_role text,
  service_description text,
  period_from date NOT NULL,
  period_to date NOT NULL,
  total_hours numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  iss_rate numeric NOT NULL DEFAULT 0,
  iss_amount numeric NOT NULL DEFAULT 0,
  inss_rate numeric NOT NULL DEFAULT 0,
  inss_amount numeric NOT NULL DEFAULT 0,
  irrf_rate numeric NOT NULL DEFAULT 0,
  irrf_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  municipal_code text,
  notes text,
  status text NOT NULL DEFAULT 'rascunho',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clock invoices" ON public.clock_invoices
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert clock invoices" ON public.clock_invoices
  FOR INSERT TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id) AND is_master(auth.uid()));

CREATE POLICY "Users can update clock invoices" ON public.clock_invoices
  FOR UPDATE TO authenticated
  USING (has_company_access(auth.uid(), company_id) AND is_master(auth.uid()));

CREATE POLICY "Users can delete clock invoices" ON public.clock_invoices
  FOR DELETE TO authenticated
  USING (has_company_access(auth.uid(), company_id) AND is_master(auth.uid()));
