CREATE OR REPLACE FUNCTION public.normalize_financial_city(_company_id uuid, _city text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _trimmed text;
  _key text;
  _candidates text[];
  _c text;
BEGIN
  IF _city IS NULL THEN RETURN NULL; END IF;
  _trimmed := regexp_replace(btrim(_city), '\s+', ' ', 'g');
  IF _trimmed = '' THEN RETURN NULL; END IF;

  _key := lower(_trimmed);
  _key := translate(_key,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
  _key := regexp_replace(_key, '[\s\-–_]+', '', 'g');

  IF _company_id = 'c963c261-bde2-4da9-9f02-829e8e48d25c' THEN
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru'];
  ELSIF _company_id = 'cb494ec4-d109-4541-aada-e5e07ab4e03e' THEN
    _candidates := ARRAY['Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho'];
  ELSIF _company_id = 'da1f794b-d847-4137-a0b8-f1a932bce3b8' THEN
    _candidates := ARRAY['Jardinópolis','Votorantim','Metro SP'];
  ELSIF _company_id = '7690fb96-6492-48ad-a410-f39092987db6' THEN
    _candidates := ARRAY['Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Lençóis Paulista','Marília','Valinhos'];
  ELSIF _company_id = 'e8f5e3a1-1b2c-4d5e-9f0a-1b2c3d4e5f6a' THEN
    _candidates := ARRAY['Botucatu Áreas Verdes Cidade','Botucatu Campos Futebol','Ribeirão Preto - Escolas','Ribeirão Preto - Supera','Bauru','Dois Córregos','Lençóis Paulista','Itatinga','Pinhalzinho','Jardinópolis','Votorantim','Metro SP','Igaraçu do Tietê','Botucatu - PSF','Botucatu - PSA','Getulina','Mineiros do Tietê','Marília','Valinhos'];
  ELSE
    _candidates := ARRAY[]::text[];
  END IF;

  FOREACH _c IN ARRAY _candidates LOOP
    IF regexp_replace(translate(lower(_c),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
        '[\s\-–_]+', '', 'g') = _key THEN
      RETURN _c;
    END IF;
  END LOOP;

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

  RETURN _trimmed;
END;
$function$;