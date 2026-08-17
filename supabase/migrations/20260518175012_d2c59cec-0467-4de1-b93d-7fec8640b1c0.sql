-- 1. Expand allowed status values to include 'duplicado', 'erro_processamento', 'cancelado'
ALTER TABLE public.professional_payments
  DROP CONSTRAINT IF EXISTS professional_payments_status_check;

ALTER TABLE public.professional_payments
  ADD CONSTRAINT professional_payments_status_check
  CHECK (status = ANY (ARRAY[
    'processando_nf','aguardando_pagamento','pagamento_enviado','pago',
    'erro','erro_processamento','pix_enviado','pix_erro','duplicado','cancelado'
  ]));

-- 2. Resolve existing duplicate (keep oldest, mark newest as 'duplicado')
UPDATE public.professional_payments
SET status = 'duplicado',
    error_message = COALESCE(error_message,'') || ' [duplicada de 5610806f-e71a-496b-9a1b-1a5de1e48da0]',
    updated_at = now()
WHERE id = '104b6783-1b71-4ac6-856e-842e0174eea3';

-- 3. Helper normalization functions
CREATE OR REPLACE FUNCTION public.normalize_cnpj(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(_v, ''), '\D', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.normalize_nf_number(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(btrim(coalesce(_v, '')))
$$;

-- 4. Hard unique index blocking duplicate invoices per company (CNPJ + NF number)
CREATE UNIQUE INDEX IF NOT EXISTS professional_payments_unique_nf_per_cnpj
ON public.professional_payments (
  company_id,
  public.normalize_cnpj(doctor_cnpj),
  public.normalize_nf_number(nf_number)
)
WHERE doctor_cnpj IS NOT NULL
  AND nf_number IS NOT NULL
  AND btrim(nf_number) <> ''
  AND status NOT IN ('cancelado','duplicado');