
CREATE TABLE public.company_inbox_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inbox_id integer NOT NULL,
  inbox_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.company_inbox_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage inbox mappings"
  ON public.company_inbox_mapping
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super-admin'))
  WITH CHECK (has_role(auth.uid(), 'super-admin'));

CREATE POLICY "Users can view inbox mappings for their companies"
  ON public.company_inbox_mapping
  FOR SELECT
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));
