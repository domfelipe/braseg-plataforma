CREATE TABLE public.schedule_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  grade_id uuid REFERENCES public.schedule_grades(id) ON DELETE CASCADE,
  rule_type text NOT NULL DEFAULT 'base',
  multiplier numeric NOT NULL DEFAULT 1.0,
  fixed_value numeric DEFAULT NULL,
  base_hourly_rate numeric DEFAULT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_payment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage payment rules"
  ON public.schedule_payment_rules FOR ALL TO authenticated
  USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)))
  WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));

CREATE POLICY "Users can view payment rules"
  ON public.schedule_payment_rules FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));