
-- Drop old table
DROP TABLE IF EXISTS public.company_inbox_mapping;

-- Create new per-company Chatwoot config table
CREATE TABLE public.company_chatwoot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  chatwoot_base_url text NOT NULL,
  chatwoot_api_token text NOT NULL,
  chatwoot_account_id text NOT NULL,
  inbox_id integer,
  inbox_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.company_chatwoot_config ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins can manage company chatwoot config"
  ON public.company_chatwoot_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super-admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super-admin'::app_role));

-- Users with company access can view
CREATE POLICY "Users can view chatwoot config for their companies"
  ON public.company_chatwoot_config
  FOR SELECT
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));
