ALTER TABLE public.professional_payments
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS validation_issues jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone;