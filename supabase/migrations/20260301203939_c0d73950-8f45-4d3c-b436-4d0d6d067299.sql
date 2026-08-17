
-- =============================================
-- 1. ROLE ENUM AND USER ROLES TABLE
-- =============================================
CREATE TYPE public.app_role AS ENUM ('super-admin', 'master', 'operacional', 'profissional');

-- =============================================
-- 2. COMPANIES TABLE
-- =============================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT NOT NULL UNIQUE,
  main_activity TEXT,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 3. USER PROFILES TABLE
-- =============================================
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 4. USER ROLES TABLE (separate from profiles per security requirements)
-- =============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- =============================================
-- 5. USER COMPANY ACCESS TABLE
-- =============================================
CREATE TABLE public.user_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  modules TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- =============================================
-- 6. FINANCIAL CATEGORIES TABLE
-- =============================================
CREATE TABLE public.financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  parent_id UUID REFERENCES public.financial_categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 7. FINANCIAL TRANSACTIONS TABLE
-- =============================================
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado')),
  category_id UUID REFERENCES public.financial_categories(id),
  cost_center TEXT,
  notes TEXT,
  attachment_url TEXT,
  recurrence TEXT CHECK (recurrence IN ('unica', 'mensal', 'quinzenal', 'semanal')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 8. PROFESSIONAL PAYMENTS TABLE
-- =============================================
CREATE TABLE public.professional_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doctor_name TEXT NOT NULL,
  doctor_company_name TEXT,
  doctor_cnpj TEXT,
  amount DECIMAL(12,2) NOT NULL,
  nf_number TEXT,
  nf_issue_date DATE,
  nf_description TEXT,
  nf_file_url TEXT,
  nf_raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento' CHECK (status IN (
    'processando_nf',
    'aguardando_pagamento',
    'pagamento_enviado',
    'pago',
    'erro'
  )),
  payment_date DATE,
  receipt_url TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 9. ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_payments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 10. SECURITY DEFINER FUNCTIONS (avoid RLS recursion)
-- =============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is master (has master role)
CREATE OR REPLACE FUNCTION public.is_master(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'master'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super-admin'
  )
$$;

-- Check if user has access to a specific company
CREATE OR REPLACE FUNCTION public.has_company_access(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_company_access
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- =============================================
-- 11. RLS POLICIES
-- =============================================

-- Companies: viewable by users who have access or are master
CREATE POLICY "Users can view companies they have access to"
  ON public.companies FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_company_access WHERE user_id = auth.uid() AND company_id = id
  ));

-- User profiles: users can see all profiles, update their own
CREATE POLICY "Authenticated users can view all profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- User roles: only viewable by the user themselves or masters
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_master(auth.uid()));

-- User company access: viewable by the user themselves or masters
CREATE POLICY "Users can view their own company access"
  ON public.user_company_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_master(auth.uid()));

-- Masters can manage company access
CREATE POLICY "Masters can manage company access"
  ON public.user_company_access FOR ALL TO authenticated
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

-- Financial categories: scoped to company access
CREATE POLICY "Users can view categories for their companies"
  ON public.financial_categories FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can manage categories for their companies"
  ON public.financial_categories FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

-- Financial transactions: scoped to company access
CREATE POLICY "Users can view transactions for their companies"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert transactions for their companies"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update transactions for their companies"
  ON public.financial_transactions FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete transactions for their companies"
  ON public.financial_transactions FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

-- Professional payments: scoped to company access
CREATE POLICY "Users can view payments for their companies"
  ON public.professional_payments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can insert payments for their companies"
  ON public.professional_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can update payments for their companies"
  ON public.professional_payments FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Users can delete payments for their companies"
  ON public.professional_payments FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

-- =============================================
-- 12. UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_financial_transactions_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_professional_payments_updated_at
  BEFORE UPDATE ON public.professional_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 13. AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- [LGPD] dados de producao removidos na limpeza do fork Braseg

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 14. STORAGE BUCKETS
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false);

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false);

-- Storage policies for invoices
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "Authenticated users can view invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "Authenticated users can update invoices"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoices');

-- Storage policies for receipts
CREATE POLICY "Authenticated users can upload receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can view receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "Authenticated users can update receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts');

-- =============================================
-- 15. SEED DATA: 5 COMPANIES
-- =============================================
-- [LGPD] dados de producao removidos na limpeza do fork Braseg


-- =============================================
-- 16. SEED DATA: DEFAULT FINANCIAL CATEGORIES (for each company)
-- =============================================
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM public.companies LOOP
    INSERT INTO public.financial_categories (company_id, name, type) VALUES
      (comp.id, 'Folha de Pagamento', 'despesa'),
      (comp.id, 'Aluguel', 'despesa'),
      (comp.id, 'Serviços', 'despesa'),
      (comp.id, 'Materiais', 'despesa'),
      (comp.id, 'Transporte', 'despesa'),
      (comp.id, 'Impostos', 'despesa'),
      (comp.id, 'Receita de Serviços', 'receita'),
      (comp.id, 'Outros', 'receita'),
      (comp.id, 'Outros', 'despesa');
  END LOOP;
END $$;
