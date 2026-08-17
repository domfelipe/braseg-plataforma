CREATE TABLE public.schedule_rotation_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.schedule_grades(id) ON DELETE CASCADE,
  pattern_name text NOT NULL DEFAULT '',
  pattern_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  cycle_days integer NOT NULL DEFAULT 7,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_rotation_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rotation patterns"
  ON public.schedule_rotation_patterns FOR ALL TO authenticated
  USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)))
  WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));

CREATE POLICY "Users can view rotation patterns"
  ON public.schedule_rotation_patterns FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));