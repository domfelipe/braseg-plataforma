
-- Table: employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  position TEXT NOT NULL,
  department TEXT,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  admission_date DATE,
  dismissal_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Unique CPF per company
CREATE UNIQUE INDEX idx_employees_cpf_company ON public.employees(cpf, company_id) WHERE cpf IS NOT NULL;

-- Validation trigger for employee status
CREATE OR REPLACE FUNCTION public.validate_employee_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'inactive', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid employee status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_employee_status_trigger
  BEFORE INSERT OR UPDATE OF status ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_employee_status();

-- Updated_at trigger
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_employees_status ON public.employees(status);

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view employees for their companies"
  ON public.employees FOR SELECT
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert employees for their companies"
  ON public.employees FOR INSERT
  WITH CHECK (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update employees for their companies"
  ON public.employees FOR UPDATE
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete employees for their companies"
  ON public.employees FOR DELETE
  USING (has_company_access(auth.uid(), company_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;

-- Table: employee_documents
CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  category TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  reference_month TEXT,
  reference_year INTEGER,
  observation TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID
);

-- Validation trigger for document category
CREATE OR REPLACE FUNCTION public.validate_document_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.category NOT IN ('admissao', 'periodico', 'atestado', 'desligamento', 'comprovante') THEN
    RAISE EXCEPTION 'Invalid document category: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_category_trigger
  BEFORE INSERT OR UPDATE OF category ON public.employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_document_category();

-- Indexes
CREATE INDEX idx_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX idx_documents_company ON public.employee_documents(company_id);
CREATE INDEX idx_documents_category ON public.employee_documents(category);
CREATE INDEX idx_documents_reference ON public.employee_documents(reference_month);

-- RLS
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents for their companies"
  ON public.employee_documents FOR SELECT
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert documents for their companies"
  ON public.employee_documents FOR INSERT
  WITH CHECK (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update documents for their companies"
  ON public.employee_documents FOR UPDATE
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete documents for their companies"
  ON public.employee_documents FOR DELETE
  USING (has_company_access(auth.uid(), company_id));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload employee documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'employee-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view employee documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update employee documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'employee-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete employee documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'employee-documents' AND auth.role() = 'authenticated');
