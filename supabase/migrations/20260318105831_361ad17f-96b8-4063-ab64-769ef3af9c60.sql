
ALTER TABLE public.shift_assignments
  ADD COLUMN custom_start_time time without time zone DEFAULT NULL,
  ADD COLUMN custom_end_time time without time zone DEFAULT NULL;
