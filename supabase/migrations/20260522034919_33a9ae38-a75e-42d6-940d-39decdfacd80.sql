-- Re-run backfill to copy name/email/interest into empty-name leads
-- from same-tenant leads with same normalized phone digits.
WITH pairs AS (
  SELECT DISTINCT ON (l1.id) l1.id AS empty_id, l2.name, l2.email, l2.interest
  FROM public.leads l1
  JOIN public.leads l2
    ON l1.tenant_id = l2.tenant_id
   AND l1.id <> l2.id
   AND regexp_replace(coalesce(l1.phone,''), '\D', '', 'g') =
       regexp_replace(coalesce(l2.phone,''), '\D', '', 'g')
   AND regexp_replace(coalesce(l1.phone,''), '\D', '', 'g') <> ''
  WHERE (l1.name IS NULL OR l1.name = '')
    AND l2.name IS NOT NULL AND l2.name <> ''
  ORDER BY l1.id, l2.created_at ASC
)
UPDATE public.leads l
SET name = COALESCE(NULLIF(l.name,''), p.name),
    email = COALESCE(NULLIF(l.email,''), p.email),
    interest = COALESCE(NULLIF(l.interest,''), p.interest),
    updated_at = now()
FROM pairs p
WHERE l.id = p.empty_id;

-- Trigger: on insert/update of a lead with a name, propagate name to
-- any other same-tenant lead with the same normalized phone but empty name.
CREATE OR REPLACE FUNCTION public.propagate_lead_name_by_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_new TEXT;
BEGIN
  IF NEW.name IS NULL OR NEW.name = '' THEN
    -- Try to pull a name from a sibling lead with same phone
    SELECT name, email, interest
      INTO NEW.name, NEW.email, NEW.interest
    FROM public.leads
    WHERE tenant_id = NEW.tenant_id
      AND id <> NEW.id
      AND name IS NOT NULL AND name <> ''
      AND regexp_replace(coalesce(phone,''), '\D', '', 'g') =
          regexp_replace(coalesce(NEW.phone,''), '\D', '', 'g')
      AND regexp_replace(coalesce(NEW.phone,''), '\D', '', 'g') <> ''
    ORDER BY created_at ASC
    LIMIT 1;
    RETURN NEW;
  END IF;

  -- Propagate downstream: fill in sibling leads missing the name
  norm_new := regexp_replace(coalesce(NEW.phone,''), '\D', '', 'g');
  IF norm_new <> '' THEN
    UPDATE public.leads
      SET name = COALESCE(NULLIF(name,''), NEW.name),
          email = COALESCE(NULLIF(email,''), NEW.email),
          interest = COALESCE(NULLIF(interest,''), NEW.interest),
          updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND id <> NEW.id
      AND (name IS NULL OR name = '')
      AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = norm_new;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_lead_name_by_phone ON public.leads;
CREATE TRIGGER trg_propagate_lead_name_by_phone
BEFORE INSERT OR UPDATE OF name, phone ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.propagate_lead_name_by_phone();