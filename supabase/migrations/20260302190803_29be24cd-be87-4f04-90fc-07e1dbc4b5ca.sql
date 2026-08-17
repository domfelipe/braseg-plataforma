
-- Create avatars bucket (public so URLs can be used in img tags)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- RLS: users can upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: anyone can view avatars (public bucket)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Add RLS policies for masters to manage user_roles
CREATE POLICY "Masters can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (is_master(auth.uid()));

CREATE POLICY "Masters can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (is_master(auth.uid()));

CREATE POLICY "Masters can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (is_master(auth.uid()));

-- Add RLS for masters to manage companies
CREATE POLICY "Masters can update companies"
ON public.companies FOR UPDATE
TO authenticated
USING (is_master(auth.uid()));
