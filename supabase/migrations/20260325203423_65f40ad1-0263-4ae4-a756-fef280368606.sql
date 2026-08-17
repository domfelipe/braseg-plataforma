ALTER TABLE public.professional_payments 
  ADD COLUMN IF NOT EXISTS sicredi_id_transacao text UNIQUE,
  ADD COLUMN IF NOT EXISTS sicredi_status text,
  ADD COLUMN IF NOT EXISTS sicredi_id_pagamento text,
  ADD COLUMN IF NOT EXISTS sicredi_end_to_end text;