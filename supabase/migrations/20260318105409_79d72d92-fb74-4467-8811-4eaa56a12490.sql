
ALTER TABLE public.user_company_access
  ADD CONSTRAINT user_company_access_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
