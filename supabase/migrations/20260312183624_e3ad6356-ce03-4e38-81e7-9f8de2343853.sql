
-- Fleet Vehicles table
CREATE TABLE public.fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plate text NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  color text,
  fuel_type text,
  current_mileage integer DEFAULT 0,
  renavam text,
  chassis text,
  status text NOT NULL DEFAULT 'ativo',
  ipva_due_date date,
  licensing_due_date date,
  insurance_due_date date,
  insurance_company text,
  acquisition_date date,
  acquisition_cost numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fleet Maintenances table
CREATE TABLE public.fleet_maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'corretiva',
  description text NOT NULL,
  date date NOT NULL,
  mileage_at_service integer,
  cost numeric NOT NULL DEFAULT 0,
  vendor text,
  items_replaced text[] DEFAULT '{}',
  attachment_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fleet Reminders table
CREATE TABLE public.fleet_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  cost numeric,
  paid_date date,
  notes text,
  attachment_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for fleet_vehicles
CREATE POLICY "Users can view fleet vehicles" ON public.fleet_vehicles FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert fleet vehicles" ON public.fleet_vehicles FOR INSERT TO authenticated WITH CHECK (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can update fleet vehicles" ON public.fleet_vehicles FOR UPDATE TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can delete fleet vehicles" ON public.fleet_vehicles FOR DELETE TO authenticated USING (has_company_access(auth.uid(), company_id));

-- RLS policies for fleet_maintenances
CREATE POLICY "Users can view fleet maintenances" ON public.fleet_maintenances FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert fleet maintenances" ON public.fleet_maintenances FOR INSERT TO authenticated WITH CHECK (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can update fleet maintenances" ON public.fleet_maintenances FOR UPDATE TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can delete fleet maintenances" ON public.fleet_maintenances FOR DELETE TO authenticated USING (has_company_access(auth.uid(), company_id));

-- RLS policies for fleet_reminders
CREATE POLICY "Users can view fleet reminders" ON public.fleet_reminders FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert fleet reminders" ON public.fleet_reminders FOR INSERT TO authenticated WITH CHECK (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can update fleet reminders" ON public.fleet_reminders FOR UPDATE TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can delete fleet reminders" ON public.fleet_reminders FOR DELETE TO authenticated USING (has_company_access(auth.uid(), company_id));

-- Updated_at trigger for fleet_vehicles
CREATE TRIGGER update_fleet_vehicles_updated_at BEFORE UPDATE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
