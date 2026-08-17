
-- Add source_payment_id to link financial_transactions back to professional_payments
ALTER TABLE public.financial_transactions 
ADD COLUMN source_payment_id uuid REFERENCES public.professional_payments(id) ON DELETE CASCADE;

-- Create unique index to prevent duplicates
CREATE UNIQUE INDEX idx_financial_transactions_source_payment 
ON public.financial_transactions(source_payment_id) 
WHERE source_payment_id IS NOT NULL;

-- Trigger function to sync professional_payments → financial_transactions
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.financial_transactions WHERE source_payment_id = OLD.id;
    RETURN OLD;
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
    -- [LGPD] dados de producao removidos na limpeza do fork Braseg

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
      updated_at = now()
    WHERE source_payment_id = NEW.id;

    -- If no row was updated (legacy data), insert
    IF NOT FOUND THEN
      -- [LGPD] dados de producao removidos na limpeza do fork Braseg

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER sync_professional_payment_to_financial
AFTER INSERT OR UPDATE OR DELETE ON public.professional_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_to_financial();
