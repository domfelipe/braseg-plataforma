
-- Create clock_locations table
CREATE TABLE public.clock_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  radius_meters integer NOT NULL DEFAULT 50,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create clock_entries table
CREATE TABLE public.clock_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  clock_location_id uuid REFERENCES public.clock_locations(id),
  type text NOT NULL,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  distance_meters numeric,
  valid boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_entries ENABLE ROW LEVEL SECURITY;

-- RLS for clock_locations: company access for all operations
CREATE POLICY "Users can view clock locations" ON public.clock_locations
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Masters can manage clock locations" ON public.clock_locations
  FOR ALL USING (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id))
  WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id));

-- RLS for clock_entries
CREATE POLICY "Users can view own clock entries" ON public.clock_entries
  FOR SELECT USING (
    has_company_access(auth.uid(), company_id) AND
    (user_id = auth.uid() OR is_master(auth.uid()))
  );

CREATE POLICY "Users can insert own clock entries" ON public.clock_entries
  FOR INSERT WITH CHECK (
    has_company_access(auth.uid(), company_id) AND user_id = auth.uid()
  );

CREATE POLICY "Masters can manage clock entries" ON public.clock_entries
  FOR ALL USING (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id))
  WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id));
