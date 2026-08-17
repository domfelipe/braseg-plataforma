
-- Escalas (schedule groups)
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grades (rows in the weekly grid)
CREATE TABLE public.schedule_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL DEFAULT '07:00',
  end_time time NOT NULL DEFAULT '19:00',
  specialty text,
  shift_type text,
  color text DEFAULT '#10b981',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shift assignments (cells in the grid)
CREATE TABLE public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.schedule_grades(id) ON DELETE CASCADE,
  date date NOT NULL,
  user_id uuid,
  slot_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmado',
  original_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shift swap requests
CREATE TABLE public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'troca',
  from_user_id uuid NOT NULL,
  to_user_id uuid,
  status text NOT NULL DEFAULT 'pendente',
  approved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Schedule financial closings
CREATE TABLE public.schedule_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper functions for RLS (security definer to avoid joins in policies)
CREATE OR REPLACE FUNCTION public.get_schedule_company_id(_schedule_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM public.schedules WHERE id = _schedule_id $$;

CREATE OR REPLACE FUNCTION public.get_grade_company_id(_grade_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT s.company_id FROM public.schedules s JOIN public.schedule_grades g ON g.schedule_id = s.id WHERE g.id = _grade_id $$;

CREATE OR REPLACE FUNCTION public.get_assignment_company_id(_assignment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT s.company_id FROM public.schedules s JOIN public.schedule_grades g ON g.schedule_id = s.id JOIN public.shift_assignments a ON a.grade_id = g.id WHERE a.id = _assignment_id $$;

-- RLS: schedules
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view schedules" ON public.schedules FOR SELECT TO authenticated USING (has_company_access(auth.uid(), company_id));
CREATE POLICY "Masters can manage schedules" ON public.schedules FOR ALL TO authenticated USING (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id)) WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), company_id));

-- RLS: schedule_grades
ALTER TABLE public.schedule_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view schedule grades" ON public.schedule_grades FOR SELECT TO authenticated USING (has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));
CREATE POLICY "Masters can manage schedule grades" ON public.schedule_grades FOR ALL TO authenticated USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id))) WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));

-- RLS: shift_assignments
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view shift assignments" ON public.shift_assignments FOR SELECT TO authenticated USING (has_company_access(auth.uid(), get_grade_company_id(grade_id)));
CREATE POLICY "Masters can manage shift assignments" ON public.shift_assignments FOR ALL TO authenticated USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_grade_company_id(grade_id))) WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_grade_company_id(grade_id)));

-- RLS: shift_swap_requests
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view swap requests" ON public.shift_swap_requests FOR SELECT TO authenticated USING (has_company_access(auth.uid(), get_assignment_company_id(assignment_id)));
CREATE POLICY "Users can create swap requests" ON public.shift_swap_requests FOR INSERT TO authenticated WITH CHECK (from_user_id = auth.uid() AND has_company_access(auth.uid(), get_assignment_company_id(assignment_id)));
CREATE POLICY "Masters can manage swap requests" ON public.shift_swap_requests FOR ALL TO authenticated USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_assignment_company_id(assignment_id))) WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_assignment_company_id(assignment_id)));

-- RLS: schedule_closings
ALTER TABLE public.schedule_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view schedule closings" ON public.schedule_closings FOR SELECT TO authenticated USING (has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));
CREATE POLICY "Masters can manage schedule closings" ON public.schedule_closings FOR ALL TO authenticated USING (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id))) WITH CHECK (is_master(auth.uid()) AND has_company_access(auth.uid(), get_schedule_company_id(schedule_id)));
