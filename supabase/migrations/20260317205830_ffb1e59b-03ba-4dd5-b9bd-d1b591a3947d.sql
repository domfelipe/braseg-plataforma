
CREATE OR REPLACE FUNCTION public.notify_payment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _title text;
  _message text;
  _type text;
  _user_ids uuid[];
BEGIN
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

  SELECT ARRAY_AGG(DISTINCT u.user_id) INTO _user_ids
  FROM (
    -- Users with company access AND 'payments' module
    SELECT uca.user_id FROM public.user_company_access uca 
    WHERE uca.company_id = NEW.company_id 
      AND uca.modules @> ARRAY['payments']
    UNION
    -- Master and super-admin always receive
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('master', 'super-admin')
  ) u;

  IF _user_ids IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT unnest(_user_ids), _type, _title, _message, '/pagamentos';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_transaction_due()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_ids uuid[];
  _days_until integer;
  _message text;
BEGIN
  IF NEW.status NOT IN ('pago', 'cancelado') AND NEW.due_date IS NOT NULL THEN
    _days_until := (NEW.due_date - CURRENT_DATE);
    
    IF _days_until BETWEEN 0 AND 7 THEN
      IF _days_until = 0 THEN
        _message := 'A transação "' || NEW.description || '" no valor de R$ ' || ROUND(NEW.amount, 2) || ' vence hoje!';
      ELSIF _days_until = 1 THEN
        _message := 'A transação "' || NEW.description || '" no valor de R$ ' || ROUND(NEW.amount, 2) || ' vence amanhã.';
      ELSE
        _message := 'A transação "' || NEW.description || '" no valor de R$ ' || ROUND(NEW.amount, 2) || ' vence em ' || _days_until || ' dias.';
      END IF;

      SELECT ARRAY_AGG(DISTINCT u.user_id) INTO _user_ids
      FROM (
        -- Users with company access AND 'financial' module
        SELECT uca.user_id FROM public.user_company_access uca 
        WHERE uca.company_id = NEW.company_id 
          AND uca.modules @> ARRAY['financial']
        UNION
        -- Master and super-admin always receive
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('master', 'super-admin')
      ) u;

      IF _user_ids IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link)
        SELECT unnest(_user_ids), 'vencimento_proximo', 'Vencimento próximo', _message, '/financeiro';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_fleet_reminder_due()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_ids uuid[];
  _days_until integer;
  _message text;
  _vehicle_plate text;
BEGIN
  IF NEW.status NOT IN ('pago', 'cancelado') AND NEW.due_date IS NOT NULL THEN
    _days_until := (NEW.due_date - CURRENT_DATE);

    IF _days_until BETWEEN 0 AND 7 THEN
      SELECT plate INTO _vehicle_plate FROM public.fleet_vehicles WHERE id = NEW.vehicle_id;

      IF _days_until = 0 THEN
        _message := 'O vencimento "' || NEW.title || '" do veículo ' || COALESCE(_vehicle_plate, '') || ' vence hoje!';
      ELSIF _days_until = 1 THEN
        _message := 'O vencimento "' || NEW.title || '" do veículo ' || COALESCE(_vehicle_plate, '') || ' vence amanhã.';
      ELSE
        _message := 'O vencimento "' || NEW.title || '" do veículo ' || COALESCE(_vehicle_plate, '') || ' vence em ' || _days_until || ' dias.';
      END IF;

      SELECT ARRAY_AGG(DISTINCT u.user_id) INTO _user_ids
      FROM (
        -- Users with company access AND 'fleet' module
        SELECT uca.user_id FROM public.user_company_access uca 
        WHERE uca.company_id = NEW.company_id 
          AND uca.modules @> ARRAY['fleet']
        UNION
        -- Master and super-admin always receive
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('master', 'super-admin')
      ) u;

      IF _user_ids IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link)
        SELECT unnest(_user_ids), 'vencimento_frota', 'Vencimento de veículo próximo', _message, '/frotas';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
