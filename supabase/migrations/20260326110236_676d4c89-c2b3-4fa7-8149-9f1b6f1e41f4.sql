ALTER TABLE public.professional_payments DROP CONSTRAINT professional_payments_status_check;

ALTER TABLE public.professional_payments ADD CONSTRAINT professional_payments_status_check 
  CHECK (status = ANY (ARRAY['processando_nf'::text, 'aguardando_pagamento'::text, 'pagamento_enviado'::text, 'pago'::text, 'erro'::text, 'pix_enviado'::text, 'pix_erro'::text]));