
-- 1) Coluna file_hash + índice único parcial
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_company_file_hash_uniq
  ON public.financial_transactions (company_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- 2) normalize_text: remove acentos, minúsculo, colapsa espaços
CREATE OR REPLACE FUNCTION public.normalize_text(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    translate(lower(coalesce(_v, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '\s+', ' ', 'g'
  )
$$;

-- 3) extract_whatsapp_message: retorna texto após "Mensagem do contato:"
CREATE OR REPLACE FUNCTION public.extract_whatsapp_message(_notes text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _m text;
BEGIN
  IF _notes IS NULL THEN RETURN NULL; END IF;
  _m := substring(_notes FROM 'Mensagem do contato:\s*([^\n\r]+)');
  IF _m IS NULL THEN RETURN NULL; END IF;
  _m := btrim(_m);
  _m := regexp_replace(_m, '\s*[-–—]{2,}.*$', '', 'g');
  _m := regexp_replace(_m, '\|.*$', '', 'g');
  RETURN NULLIF(btrim(_m), '');
END;
$$;

-- 4) infer_financial_city: retorna cidade canônica ou NULL
CREATE OR REPLACE FUNCTION public.infer_financial_city_from_message(_company_id uuid, _message text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  m text;
  acudir uuid := '7690fb96-6492-48ad-a410-f39092987db6';
  forte  uuid := 'c963c261-bde2-4da9-9f02-829e8e48d25c';
  smg    uuid := 'da1f794b-d847-4137-a0b8-f1a932bce3b8';
  rov    uuid := 'cb494ec4-d109-4541-aada-e5e07ab4e03e';
  vgaf   uuid := '6517a33a-ac87-4644-b300-4327c46dcbd0';
BEGIN
  m := public.normalize_text(_message);
  IF m IS NULL OR m = '' THEN RETURN NULL; END IF;

  -- VGAF sempre Lençóis
  IF _company_id = vgaf OR m ~ '(^|\s)vgaf(\s|$)' THEN
    RETURN 'Lençóis Paulista';
  END IF;

  IF _company_id = acudir OR m ~ '(^|\s)acudir(\s|$)' THEN
    -- prefixo/termo cidade explícita ganha
    IF m ~ 'acudir\s+igarac?u' OR m ~ '(^|\s)igarac?u' THEN
      RETURN 'Igaraçu do Tietê';
    ELSIF m ~ 'acudir\s+lencois' OR m ~ '(^|\s)lencois' THEN
      RETURN 'Lençóis Paulista';
    ELSIF m ~ 'acudir\s+getulina' OR m ~ '(^|\s)getulina' THEN
      RETURN 'Getulina';
    ELSIF m ~ '(^|\s)mineiros' THEN
      RETURN 'Mineiros do Tietê';
    ELSIF m ~ '(^|\s)marilia' THEN
      RETURN 'Marília';
    ELSIF m ~ '(^|\s)valinhos' THEN
      RETURN 'Valinhos';
    ELSIF m ~ '(^|\s)psa(\s|$)' THEN
      RETURN 'Botucatu - PSA';
    ELSIF m ~ '(^|\s)psf(\s|$)' THEN
      RETURN 'Botucatu - PSF';
    ELSIF m ~ '(^|\s)escritorio' THEN
      RETURN 'Lençóis Paulista';
    END IF;
  END IF;

  IF _company_id = forte OR m ~ '(^|\s)forte(\s|$)' THEN
    IF m ~ 'forte\s+supera' OR m ~ '(^|\s)supera' THEN
      RETURN 'Ribeirão Preto - Supera';
    ELSIF m ~ 'forte\s+ribeirao' OR m ~ '(^|\s)ribeirao' THEN
      RETURN 'Ribeirão Preto - Escolas';
    ELSIF m ~ '(^|\s)campos' THEN
      RETURN 'Botucatu Campos Futebol';
    ELSIF m ~ '(^|\s)areas verdes' OR m ~ '(^|\s)botucatu' THEN
      RETURN 'Botucatu Áreas Verdes Cidade';
    ELSIF m ~ '(^|\s)bauru' OR m ~ '(^|\s)ubs(\s|$)' THEN
      RETURN 'Bauru';
    END IF;
  END IF;

  IF _company_id = smg OR m ~ '(^|\s)smg(\s|$)' THEN
    IF m ~ '(^|\s)jardinopolis' THEN
      RETURN 'Jardinópolis';
    ELSIF m ~ '(^|\s)votorantim' THEN
      RETURN 'Votorantim';
    ELSIF m ~ '(^|\s)metro' THEN
      RETURN 'Metro SP';
    END IF;
  END IF;

  IF _company_id = rov OR m ~ '(^|\s)roversi(\s|$)' THEN
    IF m ~ '(^|\s)lencois' THEN
      RETURN 'Lençóis Paulista';
    ELSIF m ~ '(^|\s)itatinga' THEN
      RETURN 'Itatinga';
    ELSIF m ~ '(^|\s)pinhalzinho' THEN
      RETURN 'Pinhalzinho';
    ELSIF m ~ 'dois\s+corregos' THEN
      RETURN 'Dois Córregos';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 5) infer_financial_category_name: retorna nome canônico ou NULL
CREATE OR REPLACE FUNCTION public.infer_financial_category_name(_message text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  m text;
BEGIN
  m := public.normalize_text(_message);
  IF m IS NULL OR m = '' THEN RETURN NULL; END IF;

  IF m ~ '(^|\s)fgts(\s|$)' THEN RETURN 'FGTS/Encargos'; END IF;
  IF m ~ 'res?cisao|rescisoes|recisao|recisoes' THEN RETURN 'Rescisões'; END IF;
  IF m ~ '(^|\s)(vr|vale refeicao|vale alimentacao|beneficios)(\s|$)' THEN RETURN 'Benefícios/VR'; END IF;
  IF m ~ 'combustivel|abastecimento|gasolina|(^|\s)diesel|(^|\s)arla|(^|\s)posto' THEN RETURN 'Combustível'; END IF;
  IF m ~ '(^|\s)(diaria|diarias|plantao extra|hotel)(\s|$)' THEN RETURN 'Diárias/Hospedagem'; END IF;
  IF m ~ 'pedagio|free flow|(^|\s)reembolso' THEN RETURN 'Pedágio/Reembolso'; END IF;
  IF m ~ 'refeicao|alimentacao|almoco|(^|\s)lanche' THEN RETURN 'Alimentação/Refeição'; END IF;
  IF m ~ '(^|\s)aluguel' THEN RETURN 'Aluguel'; END IF;
  IF m ~ '(^|\s)(iptu|licenciamento|imposto|receita federal|darf|das|tributo|guia)(\s|$)' THEN RETURN 'Impostos e Guias'; END IF;
  IF m ~ '(^|\s)(internet|davoi|telefone|telefonia|fibra)' THEN RETURN 'Internet/Telefonia'; END IF;
  IF m ~ '(^|\s)(energia|luz|cpfl|conta de energia|conta de luz)' THEN RETURN 'Energia Elétrica'; END IF;
  IF m ~ '(^|\s)(agua|saae|saneamento|galao de agua|conta de agua)' THEN RETURN 'Água e Saneamento'; END IF;
  IF m ~ '(^|\s)(salario|aprendiz|holerite|funcionario|funcionarios|folha|ponto)' THEN RETURN 'Folha/Salários'; END IF;
  IF m ~ '(^|\s)correios' THEN RETURN 'Correios'; END IF;
  IF m ~ '(^|\s)(ventura|contabil|assessoria contabil)' THEN RETURN 'Contabilidade/Escritório'; END IF;
  IF m ~ 'manutencao|(^|\s)oleo|(^|\s)filtro|(^|\s)pecas|(^|\s)correia|(^|\s)parafuso|(^|\s)sirene|rocadeira|varredeira|(^|\s)trator|(^|\s)bomba|(^|\s)bateria|(^|\s)cinto|impressao' THEN RETURN 'Manutenção/Peças/Operacional'; END IF;
  IF m ~ '(^|\s)(boleto|parcela|fatura|caucao|taxa)(\s|$)' THEN RETURN 'Boletos/Taxas'; END IF;

  RETURN NULL;
END;
$$;

-- 6) upsert_financial_category: idempotente por (company, type, nome normalizado)
CREATE OR REPLACE FUNCTION public.upsert_financial_category(_company_id uuid, _name text, _type text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RETURN NULL; END IF;

  SELECT id INTO _id
    FROM public.financial_categories
   WHERE company_id = _company_id
     AND type = _type
     AND public.normalize_text(name) = public.normalize_text(_name)
   ORDER BY (name = _name) DESC, created_at ASC
   LIMIT 1;

  IF _id IS NOT NULL THEN RETURN _id; END IF;

  INSERT INTO public.financial_categories (company_id, name, type)
  VALUES (_company_id, _name, _type)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;
