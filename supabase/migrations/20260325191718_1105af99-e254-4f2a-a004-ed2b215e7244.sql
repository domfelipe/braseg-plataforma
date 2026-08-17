ALTER TABLE public.clock_entries 
  ADD COLUMN shift_assignment_id uuid REFERENCES public.shift_assignments(id);