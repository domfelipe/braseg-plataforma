
-- Add selfie_url column to clock_entries
ALTER TABLE public.clock_entries ADD COLUMN selfie_url text;

-- Create clock-selfies storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('clock-selfies', 'clock-selfies', false);

-- RLS: authenticated users can upload their own selfies
CREATE POLICY "Users can upload own selfies"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'clock-selfies'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- RLS: users can view own selfies
CREATE POLICY "Users can view own selfies"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'clock-selfies'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR public.is_master(auth.uid())
  )
);

-- RLS: service role full access
CREATE POLICY "Service role manages clock selfies"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'clock-selfies')
WITH CHECK (bucket_id = 'clock-selfies');
