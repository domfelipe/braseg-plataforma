CREATE OR REPLACE FUNCTION public.normalize_professional_location(_v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _t text;
  _k text;
BEGIN
  IF _v IS NULL THEN RETURN NULL; END IF;
  _t := btrim(_v);
  IF _t = '' THEN RETURN NULL; END IF;

  _k := lower(translate(_t,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));
  _k := btrim(regexp_replace(_k, '[\s\-–—_]+', ' ', 'g'));

  IF _k = 'botucatu psa' THEN RETURN 'Botucatu - PSA'; END IF;
  IF _k = 'botucatu psf' THEN RETURN 'Botucatu - PSF'; END IF;

  RETURN _t;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_normalize_professional_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.location := public.normalize_professional_location(NEW.location);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_professional_location ON public.professional_payments;

CREATE TRIGGER trg_normalize_professional_location
BEFORE INSERT OR UPDATE ON public.professional_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_professional_location();