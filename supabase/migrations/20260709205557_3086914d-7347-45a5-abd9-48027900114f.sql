
-- 1) Update city normalizer
CREATE OR REPLACE FUNCTION public.normalize_financial_city(_company_id uuid, _city text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  _trimmed text; _key text; _candidates text[]; _c text;
BEGIN
  IF _city IS NULL THEN RETURN NULL; END IF;
  _trimmed := regexp_replace(btrim(_city), '\s+', ' ', 'g');
  IF _trimmed = '' THEN RETURN NULL; END IF;
  _key := lower(_trimmed);
  _key := translate(_key,'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
  _key := regexp_replace(_key, '[\s\-–_]+', '', 'g');

  IF _company_id = 'c963c261-bde2-4da9-9f02-829e8e48d25c' THEN
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru'];
  ELSIF _company_id = 'cb494ec4-d109-4541-aada-e5e07ab4e03e' THEN
    _candidates := ARRAY['Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho','Pariquera-Açu'];
  ELSIF _company_id = 'da1f794b-d847-4137-a0b8-f1a932bce3b8' THEN
    _candidates := ARRAY['Jardinópolis','Votorantim','Metro SP','Lençóis Paulista'];
  ELSIF _company_id = '7690fb96-6492-48ad-a410-f39092987db6' THEN
    _candidates := ARRAY['Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Lençóis Paulista','Marília','Valinhos'];
  ELSIF _company_id = 'e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a' THEN
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru','Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho','Pariquera-Açu','Jardinópolis','Votorantim','Metro SP','Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Marília','Valinhos'];
  ELSE
    _candidates := ARRAY[]::text[];
  END IF;

  FOREACH _c IN ARRAY _candidates LOOP
    IF regexp_replace(translate(lower(_c),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),'[\s\-–_]+', '', 'g') = _key THEN
      RETURN _c;
    END IF;
  END LOOP;
  FOREACH _c IN ARRAY _candidates LOOP
    DECLARE _ckey text;
    BEGIN
      _ckey := regexp_replace(translate(lower(_c),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),'[\s\-–_]+', '', 'g');
      IF length(_ckey) >= 4 AND position(_ckey in _key) = 1 THEN RETURN _c; END IF;
    END;
  END LOOP;
  RETURN _trimmed;
END;
$function$;

-- 2) Update city inference (SMG lencois + Roversi pariquera)
CREATE OR REPLACE FUNCTION public.infer_financial_city_from_message(_company_id uuid, _message text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
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

  IF _company_id = vgaf OR m ~ '(^|\s)vgaf(\s|$)' THEN RETURN 'Lençóis Paulista'; END IF;

  IF _company_id = acudir OR m ~ '(^|\s)acudir(\s|$)' THEN
    IF m ~ 'acudir\s+igarac?u' OR m ~ '(^|\s)igarac?u' THEN RETURN 'Igaraçu do Tietê';
    ELSIF m ~ 'acudir\s+lencois' OR m ~ '(^|\s)lencois' THEN RETURN 'Lençóis Paulista';
    ELSIF m ~ 'acudir\s+getulina' OR m ~ '(^|\s)getulina' THEN RETURN 'Getulina';
    ELSIF m ~ '(^|\s)mineiros' THEN RETURN 'Mineiros do Tietê';
    ELSIF m ~ '(^|\s)marilia' THEN RETURN 'Marília';
    ELSIF m ~ '(^|\s)valinhos' THEN RETURN 'Valinhos';
    ELSIF m ~ '(^|\s)psa(\s|$)' THEN RETURN 'Botucatu - PSA';
    ELSIF m ~ '(^|\s)psf(\s|$)' THEN RETURN 'Botucatu - PSF';
    ELSIF m ~ '(^|\s)escritorio' THEN RETURN 'Lençóis Paulista';
    END IF;
  END IF;

  IF _company_id = forte OR m ~ '(^|\s)forte(\s|$)' THEN
    IF m ~ 'forte\s+supera' OR m ~ '(^|\s)supera' THEN RETURN 'Ribeirão Preto - Supera';
    ELSIF m ~ 'forte\s+ribeirao' OR m ~ '(^|\s)ribeirao' THEN RETURN 'Ribeirão Preto - Escolas';
    ELSIF m ~ '(^|\s)campos' THEN RETURN 'Botucatu Campos Futebol';
    ELSIF m ~ '(^|\s)areas verdes' OR m ~ '(^|\s)botucatu' THEN RETURN 'Botucatu Áreas Verdes Cidade';
    ELSIF m ~ '(^|\s)bauru' OR m ~ '(^|\s)ubs(\s|$)' THEN RETURN 'Bauru';
    END IF;
  END IF;

  IF _company_id = smg OR m ~ '(^|\s)smg(\s|$)' THEN
    IF m ~ '(^|\s)jardinopolis' THEN RETURN 'Jardinópolis';
    ELSIF m ~ '(^|\s)votorantim' THEN RETURN 'Votorantim';
    ELSIF m ~ '(^|\s)metro' THEN RETURN 'Metro SP';
    ELSIF m ~ '(^|\s)lencois' THEN RETURN 'Lençóis Paulista';
    END IF;
  END IF;

  IF _company_id = rov OR m ~ '(^|\s)roversi(\s|$)' THEN
    IF m ~ '(^|\s)lencois' THEN RETURN 'Lençóis Paulista';
    ELSIF m ~ '(^|\s)itatinga' THEN RETURN 'Itatinga';
    ELSIF m ~ '(^|\s)pinhalzinho' THEN RETURN 'Pinhalzinho';
    ELSIF m ~ 'dois\s+corregos' THEN RETURN 'Dois Córregos';
    ELSIF m ~ 'pariquera' THEN RETURN 'Pariquera-Açu';
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- 3) Update category inference: "pagamento <nome próprio>" => Pagamentos de Profissionais
CREATE OR REPLACE FUNCTION public.infer_financial_category_name(_message text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE m text;
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

  -- New rule: "pagamento <nome>" or "pgto <nome>" or "pix <nome>" => Pagamentos de Profissionais
  IF m ~ '(^|\s)(pagamento|pgto|pgt|pix)\s+[a-z]{2,}' THEN
    RETURN 'Pagamentos de Profissionais';
  END IF;

  RETURN NULL;
END;
$function$;

-- 4) Backfill: reprocess pending city/category using updated functions
DO $$
DECLARE
  _batch text := 'phase-3.6-' || to_char(now(),'YYYYMMDDHH24MISS');
  _rows_before bigint; _rows_after bigint;
  _cents_before bigint; _cents_after bigint;
  _r record; _new_city text; _new_cat_name text; _new_cat_id uuid; _msg text;
BEGIN
  SELECT count(*), COALESCE(sum(round(amount*100)::bigint),0) INTO _rows_before, _cents_before FROM public.financial_transactions;

  FOR _r IN
    SELECT id, company_id, type, city, category_id, notes
      FROM public.financial_transactions
     WHERE (city IS NULL OR category_id IS NULL)
       AND notes ILIKE '%Mensagem do contato:%'
  LOOP
    _msg := public.extract_whatsapp_message(_r.notes);
    IF _msg IS NULL THEN CONTINUE; END IF;

    IF _r.city IS NULL THEN
      _new_city := public.infer_financial_city_from_message(_r.company_id, _msg);
      IF _new_city IS NOT NULL THEN
        UPDATE public.financial_transactions SET city = _new_city WHERE id = _r.id;
        INSERT INTO public.financial_backfill_audit(batch, transaction_id, field, old_value, new_value, reason)
          VALUES (_batch, _r.id, 'city', _r.city, _new_city, 'infer from message');
      END IF;
    END IF;

    IF _r.category_id IS NULL THEN
      _new_cat_name := public.infer_financial_category_name(_msg);
      IF _new_cat_name IS NOT NULL THEN
        _new_cat_id := public.upsert_financial_category(_r.company_id, _new_cat_name, COALESCE(_r.type,'despesa'));
        IF _new_cat_id IS NOT NULL THEN
          UPDATE public.financial_transactions SET category_id = _new_cat_id WHERE id = _r.id;
          INSERT INTO public.financial_backfill_audit(batch, transaction_id, field, old_value, new_value, reason)
            VALUES (_batch, _r.id, 'category_id', NULL, _new_cat_id::text, 'infer ' || _new_cat_name);
        END IF;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*), COALESCE(sum(round(amount*100)::bigint),0) INTO _rows_after, _cents_after FROM public.financial_transactions;
  IF _rows_before <> _rows_after OR _cents_before <> _cents_after THEN
    RAISE EXCEPTION 'Invariant violated: rows/cents changed %/% -> %/%', _rows_before,_cents_before,_rows_after,_cents_after;
  END IF;
END $$;
