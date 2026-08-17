
-- Canonical list per company (mirrors src/lib/companyLocations.ts)
CREATE OR REPLACE FUNCTION public.normalize_financial_city(_company_id uuid, _city text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _trimmed text;
  _key text;
  _canonical text;
  _candidates text[];
  _c text;
BEGIN
  IF _city IS NULL THEN RETURN NULL; END IF;
  _trimmed := regexp_replace(btrim(_city), '\s+', ' ', 'g');
  IF _trimmed = '' THEN RETURN NULL; END IF;

  -- Normalize key: lower + strip accents (manual replace to avoid unaccent extension dependency)
  _key := lower(_trimmed);
  _key := translate(_key,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
  _key := regexp_replace(_key, '[\s\-–_]+', '', 'g');

  -- Per-company canonical lists
  IF _company_id = 'c963c261-bde2-4da9-9f02-829e8e48d25c' THEN -- FORTE
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru'];
  ELSIF _company_id = 'cb494ec4-d109-4541-aada-e5e07ab4e03e' THEN -- ROVERSI
    _candidates := ARRAY['Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho'];
  ELSIF _company_id = 'da1f794b-d847-4137-a0b8-f1a932bce3b8' THEN -- SMG
    _candidates := ARRAY['Jardinópolis','Votorantim','Metro SP'];
  ELSIF _company_id = '7690fb96-6492-48ad-a410-f39092987db6' THEN -- ACUDIR
    _candidates := ARRAY['Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Lençóis Paulista','Marília'];
  ELSIF _company_id = 'e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a' THEN -- ESCRITÓRIO
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru','Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho','Jardinópolis','Votorantim','Metro SP','Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Marília'];
  ELSE
    _candidates := ARRAY[]::text[];
  END IF;

  -- Exact normalized match against canonical list
  FOREACH _c IN ARRAY _candidates LOOP
    IF regexp_replace(translate(lower(_c),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
        '[\s\-–_]+', '', 'g') = _key THEN
      RETURN _c;
    END IF;
  END LOOP;

  -- Prefix match: input starts with canonical key (ex.: "Bauru - Centros de Saúde" → "Bauru";
  -- "Ribeirão Preto - Supera Parque" → "Ribeirão Preto - Supera";
  -- "Dois Córregos - escavadeira" → "Dois Córregos")
  FOREACH _c IN ARRAY _candidates LOOP
    DECLARE _ckey text;
    BEGIN
      _ckey := regexp_replace(translate(lower(_c),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
        '[\s\-–_]+', '', 'g');
      IF length(_ckey) >= 4 AND position(_ckey in _key) = 1 THEN
        RETURN _c;
      END IF;
    END;
  END LOOP;

  -- Fallback: return cleaned (trimmed + collapsed spaces) value as-is
  RETURN _trimmed;
END;
$$;

-- Trigger to apply normalizer on every write
CREATE OR REPLACE FUNCTION public.tg_normalize_financial_city()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.city := public.normalize_financial_city(NEW.company_id, NEW.city);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_financial_city ON public.financial_transactions;
CREATE TRIGGER trg_normalize_financial_city
BEFORE INSERT OR UPDATE OF city, company_id ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_financial_city();

-- Clean up existing data
UPDATE public.financial_transactions
SET city = public.normalize_financial_city(company_id, city)
WHERE city IS NOT NULL
  AND city IS DISTINCT FROM public.normalize_financial_city(company_id, city);
