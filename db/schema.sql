-- Braseg Portal — schema Neon (Lakebase Postgres)
-- Aplicado por db/migrate.mjs com DATABASE_URL_UNPOOLED (direct).
-- user_id = Clerk user id (text). Segurança por tenancy na camada de API.

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_name text,
  cnpj text NOT NULL UNIQUE,
  main_activity text,
  address_city text,
  address_state text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_company_access (
  user_id text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  modules text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS fleet_maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'corretiva',
  description text NOT NULL,
  date date NOT NULL,
  mileage_at_service integer,
  cost numeric NOT NULL DEFAULT 0,
  vendor text,
  items_replaced text[] DEFAULT '{}',
  attachment_url text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  cost numeric,
  paid_date date,
  notes text,
  attachment_url text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'pre_uso',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES fleet_checklist_templates(id) ON DELETE CASCADE,
  description text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fleet_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES fleet_checklist_templates(id),
  driver_name text,
  odometer integer,
  status text NOT NULL DEFAULT 'conforme',
  notes text,
  signature_data_url text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES fleet_checklists(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES fleet_checklist_items(id),
  ok boolean NOT NULL,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fotos: data_url (base64 ≤5MB) no MVP; upgrade p/ Vercel Blob na v2
CREATE TABLE IF NOT EXISTS fleet_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES fleet_checklists(id) ON DELETE CASCADE,
  data_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_company ON fleet_vehicles (company_id, plate);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenances_company ON fleet_maintenances (company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_reminders_company ON fleet_reminders (company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_fleet_checklists_company_created ON fleet_checklists (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_checklists_vehicle_created ON fleet_checklists (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_checklist_answers_checklist ON fleet_checklist_answers (checklist_id);
CREATE INDEX IF NOT EXISTS idx_fleet_checklist_photos_checklist ON fleet_checklist_photos (checklist_id);
