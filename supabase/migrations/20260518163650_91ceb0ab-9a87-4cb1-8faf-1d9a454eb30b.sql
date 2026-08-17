
CREATE TABLE public.whatsapp_send_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  payment_id UUID,
  doctor_name TEXT NOT NULL,
  amount NUMERIC,
  message_preview TEXT,
  status TEXT NOT NULL DEFAULT 'enviado',
  sent_by UUID,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_whatsapp_send_history_company ON public.whatsapp_send_history(company_id, sent_at DESC);

ALTER TABLE public.whatsapp_send_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view whatsapp history for their companies"
ON public.whatsapp_send_history FOR SELECT TO authenticated
USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert whatsapp history for their companies"
ON public.whatsapp_send_history FOR INSERT TO authenticated
WITH CHECK (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update whatsapp history for their companies"
ON public.whatsapp_send_history FOR UPDATE TO authenticated
USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete whatsapp history for their companies"
ON public.whatsapp_send_history FOR DELETE TO authenticated
USING (has_company_access(auth.uid(), company_id));
