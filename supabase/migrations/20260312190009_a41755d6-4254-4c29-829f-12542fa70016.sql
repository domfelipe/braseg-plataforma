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
        SELECT uca.user_id FROM public.user_company_access uca WHERE uca.company_id = NEW.company_id
        UNION
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('master', 'super-admin')
      ) u;

      IF _user_ids IS NOT NULL THEN
        -- [LGPD] dados de producao removidos na limpeza do fork Braseg

      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER fleet_reminder_notify
  AFTER INSERT OR UPDATE ON public.fleet_reminders
  FOR EACH ROW EXECUTE FUNCTION public.notify_fleet_reminder_due();