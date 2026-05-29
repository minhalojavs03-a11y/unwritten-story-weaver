-- Safety net: canonicalize lead.phone on insert/update and backfill name from any other lead
-- in the same tenant that shares the same canonical phone.

CREATE OR REPLACE FUNCTION public.normalize_lead_phone_and_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _digits text;
  _canonical text;
  _sibling_name text;
BEGIN
  IF NEW.phone IS NOT NULL THEN
    _digits := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(_digits) >= 8 THEN
      IF length(_digits) = 12 AND left(_digits, 2) = '55' THEN
        _digits := substring(_digits, 1, 4) || '9' || substring(_digits, 5);
      ELSIF length(_digits) = 11 AND substring(_digits, 3, 1) = '9' THEN
        _digits := '55' || _digits;
      END IF;
      _canonical := '+' || _digits;
      NEW.phone := _canonical;
    END IF;
  END IF;

  -- If incoming name is missing or looks like a phone, try to pull a real name
  -- from another lead in the same tenant with the same canonical phone.
  IF NEW.tenant_id IS NOT NULL AND NEW.phone IS NOT NULL
     AND (NEW.name IS NULL OR NEW.name = '' OR NEW.name ~ '^[\d+\s().-]+$') THEN
    SELECT l.name INTO _sibling_name
    FROM public.leads l
    WHERE l.tenant_id = NEW.tenant_id
      AND l.id IS DISTINCT FROM NEW.id
      AND l.name IS NOT NULL AND l.name <> '' AND l.name !~ '^[\d+\s().-]+$'
      AND regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')
          = regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g')
    ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
    LIMIT 1;
    IF _sibling_name IS NOT NULL THEN
      NEW.name := _sibling_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lead_phone_and_name ON public.leads;
CREATE TRIGGER trg_normalize_lead_phone_and_name
BEFORE INSERT OR UPDATE OF phone, name ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.normalize_lead_phone_and_name();

-- Re-install the existing propagate trigger (downstream fill of sibling leads)
DROP TRIGGER IF EXISTS trg_propagate_lead_name_by_phone ON public.leads;
CREATE TRIGGER trg_propagate_lead_name_by_phone
AFTER INSERT OR UPDATE OF name ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.propagate_lead_name_by_phone();

-- One-off backfill: any lead with NULL/empty name and a phone-like placeholder gets the phone string,
-- so the UI never renders blank. (Real names will replace this on the next webhook.)
UPDATE public.leads
SET name = phone
WHERE (name IS NULL OR name = '')
  AND phone IS NOT NULL AND phone <> '';