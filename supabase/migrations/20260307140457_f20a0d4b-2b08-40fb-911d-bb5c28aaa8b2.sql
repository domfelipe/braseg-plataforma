
-- Create system_settings table
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only super-admin can read
CREATE POLICY "Super admins can view system settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Only super-admin can insert
CREATE POLICY "Super admins can insert system settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

-- Only super-admin can update
CREATE POLICY "Super admins can update system settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Only super-admin can delete
CREATE POLICY "Super admins can delete system settings"
  ON public.system_settings
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));
