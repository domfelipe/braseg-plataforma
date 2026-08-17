
ALTER TABLE public.shift_assignments
  ADD CONSTRAINT shift_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
