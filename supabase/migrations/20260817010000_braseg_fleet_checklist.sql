-- Braseg Portal — Fase 2: checklist de inspeção de frota
-- Modelos reutilizáveis, itens, execuções, respostas e fotos.
-- RLS: mesmo padrão do módulo Frotas (has_company_access / is_master).

CREATE TABLE public.fleet_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'pre_uso', -- pre_uso | manutencao | vistoria
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fleet_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.fleet_checklist_templates(id) ON DELETE CASCADE,
  description text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.fleet_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.fleet_checklist_templates(id),
  driver_name text,
  odometer integer,
  status text NOT NULL DEFAULT 'conforme', -- conforme | nao_conforme
  notes text,
  signature_data_url text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fleet_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.fleet_checklists(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.fleet_checklist_items(id),
  ok boolean NOT NULL,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fleet_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.fleet_checklists(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fleet_checklists_company_created ON public.fleet_checklists (company_id, created_at DESC);
CREATE INDEX idx_fleet_checklists_vehicle_created ON public.fleet_checklists (vehicle_id, created_at DESC);
CREATE INDEX idx_fleet_checklists_template ON public.fleet_checklists (template_id);
CREATE INDEX idx_fleet_checklist_answers_checklist ON public.fleet_checklist_answers (checklist_id);
CREATE INDEX idx_fleet_checklist_photos_checklist ON public.fleet_checklist_photos (checklist_id);

ALTER TABLE public.fleet_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_checklist_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_checklist_photos ENABLE ROW LEVEL SECURITY;

-- Templates (têm company_id direto)
CREATE POLICY "Users can view checklist templates" ON public.fleet_checklist_templates FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert checklist templates" ON public.fleet_checklist_templates FOR INSERT TO authenticated WITH CHECK (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can update checklist templates" ON public.fleet_checklist_templates FOR UPDATE TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can delete checklist templates" ON public.fleet_checklist_templates FOR DELETE TO authenticated USING (has_company_access(auth.uid(), company_id));

-- Itens (via template)
CREATE POLICY "Users can view checklist items" ON public.fleet_checklist_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklist_templates t WHERE t.id = template_id AND has_company_access(auth.uid(), t.company_id)));
CREATE POLICY "Users can insert checklist items" ON public.fleet_checklist_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.fleet_checklist_templates t WHERE t.id = template_id AND has_company_access(auth.uid(), t.company_id)));
CREATE POLICY "Users can update checklist items" ON public.fleet_checklist_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklist_templates t WHERE t.id = template_id AND has_company_access(auth.uid(), t.company_id)));
CREATE POLICY "Users can delete checklist items" ON public.fleet_checklist_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklist_templates t WHERE t.id = template_id AND has_company_access(auth.uid(), t.company_id)));

-- Execuções
CREATE POLICY "Users can view fleet checklists" ON public.fleet_checklists FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert fleet checklists" ON public.fleet_checklists FOR INSERT TO authenticated WITH CHECK (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can update fleet checklists" ON public.fleet_checklists FOR UPDATE TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can delete fleet checklists" ON public.fleet_checklists FOR DELETE TO authenticated USING (has_company_access(auth.uid(), company_id));

-- Respostas (via execução)
CREATE POLICY "Users can view checklist answers" ON public.fleet_checklist_answers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));
CREATE POLICY "Users can insert checklist answers" ON public.fleet_checklist_answers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));
CREATE POLICY "Users can update checklist answers" ON public.fleet_checklist_answers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));
CREATE POLICY "Users can delete checklist answers" ON public.fleet_checklist_answers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));

-- Fotos (via execução)
CREATE POLICY "Users can view checklist photos" ON public.fleet_checklist_photos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));
CREATE POLICY "Users can insert checklist photos" ON public.fleet_checklist_photos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));
CREATE POLICY "Users can delete checklist photos" ON public.fleet_checklist_photos FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.fleet_checklists c WHERE c.id = checklist_id AND has_company_access(auth.uid(), c.company_id)));

-- Bucket privado de fotos de inspeção (path: {company_id}/{checklist_id}/{arquivo})
INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet-checklists', 'fleet-checklists', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload fleet checklist photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fleet-checklists'
  AND (public.is_master(auth.uid()) OR (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM public.user_company_access WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Users can read fleet checklist photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fleet-checklists'
  AND (public.is_master(auth.uid()) OR (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM public.user_company_access WHERE user_id = auth.uid()
  ))
);
