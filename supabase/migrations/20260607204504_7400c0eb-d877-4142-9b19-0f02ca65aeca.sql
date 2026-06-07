CREATE OR REPLACE FUNCTION public.parse_credit_from_interest(_interest text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _txt text;
  _m text[];
  _raw numeric;
  _value numeric;
  _max numeric := NULL;
BEGIN
  IF _interest IS NULL OR btrim(_interest) = '' THEN
    RETURN NULL;
  END IF;

  _txt := lower(_interest);
  _txt := translate(_txt, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  _txt := replace(_txt, '_', ' ');
  _txt := replace(_txt, '-', ' ');

  FOR _m IN
    SELECT regexp_matches(_txt, '([0-9]+(?:[\.,][0-9]+)?)\s*(milhoes|milhao|mil|k|mi|m)?', 'g')
  LOOP
    _raw := replace(_m[1], ',', '.')::numeric;

    IF _m[2] IN ('milhao', 'milhoes', 'mi', 'm') THEN
      _value := _raw * 1000000;
    ELSIF _m[2] IN ('mil', 'k') THEN
      _value := _raw * 1000;
    ELSIF _raw >= 10000 THEN
      _value := _raw;
    ELSE
      _value := _raw * 1000;
    END IF;

    IF _max IS NULL OR _value > _max THEN
      _max := _value;
    END IF;
  END LOOP;

  RETURN _max;
END;
$$;