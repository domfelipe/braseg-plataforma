
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'sistema',
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow triggers (service role) to insert
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add notification_preferences to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"pagamento_recebido": true, "pagamento_status": true, "vencimento_proximo": true, "sistema": true}'::jsonb;

-- Trigger function for professional_payments notifications
CREATE OR REPLACE FUNCTION public.notify_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _title text;
  _message text;
  _type text;
  _user_ids uuid[];
BEGIN
  -- Determine notification content based on operation
  IF TG_OP = 'INSERT' THEN
    _type := 'pagamento_recebido';
    _title := 'Nova NF recebida';
    _message := 'Nota fiscal de ' || NEW.doctor_name || ' no valor de R$ ' || ROUND(NEW.amount, 2);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _type := 'pagamento_status';
    _title := 'Status de pagamento atualizado';
    _message := 'Pagamento de ' || NEW.doctor_name || ' alterado para ' || 
      CASE NEW.status
        WHEN 'aguardando_pagamento' THEN 'aguardando pagamento'
        WHEN 'pagamento_enviado' THEN 'pagamento enviado'
        WHEN 'pago' THEN 'pago'
        WHEN 'processando_nf' THEN 'processando NF'
        ELSE NEW.status
      END;
  ELSE
    RETURN NEW;
  END IF;

  -- Get all users with access to this company
  SELECT ARRAY_AGG(DISTINCT u.user_id) INTO _user_ids
  FROM (
    SELECT uca.user_id FROM public.user_company_access uca WHERE uca.company_id = NEW.company_id
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('master', 'super-admin')
  ) u;

  -- Insert notifications for each user
  IF _user_ids IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT unnest(_user_ids), _type, _title, _message, '/pagamentos';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on professional_payments
CREATE TRIGGER on_payment_change
  AFTER INSERT OR UPDATE ON public.professional_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_payment_change();
