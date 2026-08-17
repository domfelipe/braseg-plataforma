
-- Update the trigger function to assign the "Pagamentos de Profissionais" category
CREATE OR REPLACE FUNCTION public.sync_payment_to_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
  _description text;
  _due_date date;
  _category_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.financial_transactions WHERE source_payment_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Find or create the "Pagamentos de Profissionais" category for this company
  SELECT id INTO _category_id
  FROM public.financial_categories
  WHERE company_id = NEW.company_id
    AND name = 'Pagamentos de Profissionais'
    AND type = 'despesa'
  LIMIT 1;

  IF _category_id IS NULL THEN
    INSERT INTO public.financial_categories (company_id, name, type)
    VALUES (NEW.company_id, 'Pagamentos de Profissionais', 'despesa')
    RETURNING id INTO _category_id;
  END IF;

  -- Map payment status to financial status
  _status := CASE NEW.status
    WHEN 'pago' THEN 'pago'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE 'pendente'
  END;

  _description := 'NF ' || COALESCE(NEW.nf_number, 'S/N') || ' - ' || NEW.doctor_name;
  _due_date := COALESCE(NEW.nf_issue_date, CURRENT_DATE);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_transactions (
      company_id, type, description, amount, due_date, 
      payment_date, status, city, created_by, source_payment_id,
      attachment_url, notes, category_id
    ) VALUES (
      NEW.company_id, 'despesa', _description, NEW.amount, _due_date,
      NEW.payment_date, _status, NEW.location, NEW.created_by, NEW.id,
      NEW.nf_file_url, 
      CASE WHEN NEW.doctor_cnpj IS NOT NULL 
        THEN 'CNPJ: ' || NEW.doctor_cnpj || COALESCE(' | ' || NEW.doctor_company_name, '')
        ELSE NULL 
      END,
      _category_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.financial_transactions SET
      description = _description,
      amount = NEW.amount,
      due_date = _due_date,
      payment_date = NEW.payment_date,
      status = _status,
      city = NEW.location,
      attachment_url = NEW.nf_file_url,
      notes = CASE WHEN NEW.doctor_cnpj IS NOT NULL 
        THEN 'CNPJ: ' || NEW.doctor_cnpj || COALESCE(' | ' || NEW.doctor_company_name, '')
        ELSE NULL 
      END,
      category_id = _category_id,
      updated_at = now()
    WHERE source_payment_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO public.financial_transactions (
        company_id, type, description, amount, due_date, 
        payment_date, status, city, created_by, source_payment_id,
        attachment_url, notes, category_id
      ) VALUES (
        NEW.company_id, 'despesa', _description, NEW.amount, _due_date,
        NEW.payment_date, _status, NEW.location, NEW.created_by, NEW.id,
        NEW.nf_file_url,
        CASE WHEN NEW.doctor_cnpj IS NOT NULL 
          THEN 'CNPJ: ' || NEW.doctor_cnpj || COALESCE(' | ' || NEW.doctor_company_name, '')
          ELSE NULL 
        END,
        _category_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: assign category to existing synced transactions
DO $$
DECLARE
  _company_id uuid;
  _category_id uuid;
BEGIN
  FOR _company_id IN
    SELECT DISTINCT company_id FROM public.financial_transactions WHERE source_payment_id IS NOT NULL
  LOOP
    SELECT id INTO _category_id
    FROM public.financial_categories
    WHERE company_id = _company_id AND name = 'Pagamentos de Profissionais' AND type = 'despesa'
    LIMIT 1;

    IF _category_id IS NULL THEN
      INSERT INTO public.financial_categories (company_id, name, type)
      VALUES (_company_id, 'Pagamentos de Profissionais', 'despesa')
      RETURNING id INTO _category_id;
    END IF;

    UPDATE public.financial_transactions
    SET category_id = _category_id
    WHERE company_id = _company_id AND source_payment_id IS NOT NULL;
  END LOOP;
END;
$$;
