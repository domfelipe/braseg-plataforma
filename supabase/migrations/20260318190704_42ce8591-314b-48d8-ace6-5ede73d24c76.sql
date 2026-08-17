UPDATE user_company_access
SET modules = array_replace(modules, 'financial_pagar', 'financial_receber')
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'fortecorporativa@gmail.com');