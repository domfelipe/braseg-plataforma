-- Create events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  color text,
  google_event_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create calendar_sync_config table
CREATE TABLE public.calendar_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_channel_id text,
  sync_resource_id text,
  sync_expiration timestamptz,
  sync_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_config ENABLE ROW LEVEL SECURITY;

-- RLS for events: company access
CREATE POLICY "Users can view events for their companies" ON public.events
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert events for their companies" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update events for their companies" ON public.events
  FOR UPDATE TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete events for their companies" ON public.events
  FOR DELETE TO authenticated
  USING (has_company_access(auth.uid(), company_id));

-- RLS for calendar_sync_config: super-admin only
CREATE POLICY "Super admins can manage calendar sync config" ON public.calendar_sync_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super-admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super-admin'::app_role));

-- Service role needs access for edge functions
CREATE POLICY "Service role can manage calendar sync config" ON public.calendar_sync_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage events" ON public.events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime for events
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- Updated_at trigger for events
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_sync_config_updated_at
  BEFORE UPDATE ON public.calendar_sync_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();