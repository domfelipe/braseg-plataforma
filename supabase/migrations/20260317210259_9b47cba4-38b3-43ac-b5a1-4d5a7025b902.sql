
DROP POLICY IF EXISTS "Users can view companies they have access to" ON public.companies;

CREATE POLICY "Users can view companies they have access to"
ON public.companies
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid()) OR EXISTS (
    SELECT 1 FROM user_company_access
    WHERE user_company_access.user_id = auth.uid()
      AND user_company_access.company_id = companies.id
  )
);
