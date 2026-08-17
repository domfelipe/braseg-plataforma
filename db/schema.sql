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


-- ======================================================================
-- MÓDULO SEGURANÇA DO TRABALHO (PGR/PGRTR) — Fase 3 do portal
-- Spec: docs/superpowers/specs/2026-08-17-braseg-portal-seguranca-pgr-spec-v1.md
-- ======================================================================

CREATE TABLE IF NOT EXISTS seg_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  razao_social text NOT NULL,
  cnpj text NOT NULL,
  cnae text,
  grau_risco smallint,
  endereco jsonb,
  n_funcionarios integer,
  responsavel text,
  atividade_principal text,
  status text NOT NULL DEFAULT 'ativo',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, cnpj)
);

CREATE TABLE IF NOT EXISTS seg_client_members (
  user_id text NOT NULL,
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS seg_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS seg_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sector_id uuid REFERENCES seg_sectors(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seg_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_id uuid REFERENCES seg_roles(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES seg_sectors(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS seg_role_agents (
  role_id uuid NOT NULL REFERENCES seg_roles(id) ON DELETE CASCADE,
  agent_code text NOT NULL,
  PRIMARY KEY (role_id, agent_code)
);

CREATE TABLE IF NOT EXISTS seg_ges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sector_id uuid REFERENCES seg_sectors(id) ON DELETE SET NULL,
  activities text NOT NULL DEFAULT '',
  UNIQUE (client_id, code)
);

CREATE TABLE IF NOT EXISTS seg_ges_agents (
  ges_id uuid NOT NULL REFERENCES seg_ges(id) ON DELETE CASCADE,
  agent_code text NOT NULL,
  PRIMARY KEY (ges_id, agent_code)
);

CREATE TABLE IF NOT EXISTS seg_ges_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ges_id uuid NOT NULL REFERENCES seg_ges(id) ON DELETE CASCADE,
  blob_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seg_inventory_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  ges_id uuid NOT NULL REFERENCES seg_ges(id) ON DELETE CASCADE,
  agent_code text NOT NULL,
  frequency text NOT NULL,
  severity smallint NOT NULL,
  classification text NOT NULL,
  effects text NOT NULL DEFAULT '',
  existing_measures text NOT NULL DEFAULT '',
  proposed_measures text NOT NULL DEFAULT '',
  record_control text NOT NULL DEFAULT '',
  nr_codes text[] NOT NULL DEFAULT '{}',
  UNIQUE (client_id, ges_id, agent_code)
);

CREATE TABLE IF NOT EXISTS seg_action_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  description text NOT NULL,
  responsible text,
  deadline date,
  status text NOT NULL DEFAULT 'pendente',
  risk_id uuid REFERENCES seg_inventory_risks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seg_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES seg_clients(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  valid_from date,
  valid_until date,
  catalog_layout_version text,
  signature_data_url text,
  docx_blob_url text,
  pdf_blob_url text,
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seg_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES seg_documents(id) ON DELETE CASCADE,
  version text NOT NULL,
  note text NOT NULL DEFAULT '',
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seg_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  client_id uuid NOT NULL,
  entity text NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  client_mutation_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  UNIQUE (client_mutation_id)
);

CREATE TABLE IF NOT EXISTS seg_esocial_tables (
  code text PRIMARY KEY,
  name text NOT NULL,
  layout_version text NOT NULL
);

CREATE TABLE IF NOT EXISTS seg_esocial_agents (
  code text PRIMARY KEY,
  table_code text NOT NULL DEFAULT '24',
  grp text NOT NULL,
  subgroup text NOT NULL DEFAULT '',
  agent text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS seg_nrs (
  code text PRIMARY KEY,
  title text NOT NULL,
  summary text,
  url text,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_seg_clients_company ON seg_clients (company_id, status);
CREATE INDEX IF NOT EXISTS idx_seg_roles_client ON seg_roles (client_id);
CREATE INDEX IF NOT EXISTS idx_seg_employees_client_role ON seg_employees (client_id, role_id);
CREATE INDEX IF NOT EXISTS idx_seg_role_agents_role ON seg_role_agents (role_id);
CREATE INDEX IF NOT EXISTS idx_seg_ges_client ON seg_ges (client_id);
CREATE INDEX IF NOT EXISTS idx_seg_ges_agents_ges ON seg_ges_agents (ges_id);
CREATE INDEX IF NOT EXISTS idx_seg_ges_photos_ges ON seg_ges_photos (ges_id);
CREATE INDEX IF NOT EXISTS idx_seg_inventory_client_ges ON seg_inventory_risks (client_id, ges_id);
CREATE INDEX IF NOT EXISTS idx_seg_action_plan_client_status ON seg_action_plan (client_id, status);
CREATE INDEX IF NOT EXISTS idx_seg_documents_client_type ON seg_documents (client_id, doc_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_seg_sync_outbox_company_client ON seg_sync_outbox (company_id, client_id, status);

