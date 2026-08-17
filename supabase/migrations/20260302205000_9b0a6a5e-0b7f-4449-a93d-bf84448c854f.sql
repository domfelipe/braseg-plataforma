
-- Function to notify about transactions due within 7 days
CREATE OR REPLACE FUNCTION public.notify_transaction_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_ids uuid[];
  _days_until integer;
  _message text;
BEGIN
  -- Only for pending transactions with due_date within 7 days
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

      -- Get users with access to this company
      SELECT ARRAY_AGG(DISTINCT u.user_id) INTO _user_ids
      FROM (
        SELECT uca.user_id FROM public.user_company_access uca WHERE uca.company_id = NEW.company_id
        UNION
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
$$;

-- Trigger on INSERT and UPDATE of financial_transactions
CREATE TRIGGER on_transaction_due_check
  AFTER INSERT OR UPDATE OF due_date, status ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_transaction_due();
