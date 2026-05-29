
-- 1) Helper: canonical BR phone (digits-only, with mobile 9-prefix when applicable)
CREATE OR REPLACE FUNCTION public.canonical_br_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p, '\D', '', 'g');
  IF d IS NULL OR length(d) < 8 THEN RETURN NULL; END IF;
  -- BR mobile without leading 9 → add it
  IF length(d) = 12 AND d LIKE '55%' THEN
    d := substring(d,1,4) || '9' || substring(d,5);
  END IF;
  -- BR without country code (DDD + 9 + 8 digits = 11) → add 55
  IF length(d) = 11 AND substring(d,3,1) = '9' THEN
    d := '55' || d;
  END IF;
  RETURN d;
END;
$$;

-- 2) Merge duplicates: for each canonical phone with multiple leads, merge into one
DO $$
DECLARE
  grp RECORD;
  target_id uuid;
  loser_id uuid;
  best_name text;
  best_email text;
  best_interest text;
  any_sheet boolean;
  any_sheet_row int;
BEGIN
  FOR grp IN
    SELECT public.canonical_br_phone(phone) AS canon, array_agg(id ORDER BY created_at) AS ids
    FROM public.leads
    WHERE phone IS NOT NULL
    GROUP BY public.canonical_br_phone(phone)
    HAVING count(*) > 1 AND public.canonical_br_phone(phone) IS NOT NULL
  LOOP
    -- Target = the lead with the most messages (keeps conversation history)
    SELECT l.id INTO target_id
    FROM unnest(grp.ids) AS x(id)
    JOIN public.leads l ON l.id = x.id
    LEFT JOIN (
      SELECT lead_id, count(*) AS c FROM public.messages WHERE lead_id = ANY(grp.ids) GROUP BY lead_id
    ) m ON m.lead_id = l.id
    ORDER BY COALESCE(m.c, 0) DESC, l.created_at ASC
    LIMIT 1;

    -- Aggregate the best fields across the group
    SELECT
      max(CASE WHEN name IS NOT NULL AND length(trim(name)) > 0 THEN name END),
      max(CASE WHEN email IS NOT NULL AND length(trim(email)) > 0 THEN email END),
      max(CASE WHEN interest IS NOT NULL AND length(trim(interest)) > 0 THEN interest END),
      bool_or(COALESCE(imported_from_sheet, false)),
      max(sheet_row_index)
    INTO best_name, best_email, best_interest, any_sheet, any_sheet_row
    FROM public.leads WHERE id = ANY(grp.ids);

    -- Reassign children FKs from losers → target, then delete losers
    FOREACH loser_id IN ARRAY grp.ids LOOP
      IF loser_id = target_id THEN CONTINUE; END IF;
      UPDATE public.messages SET lead_id = target_id WHERE lead_id = loser_id;
      UPDATE public.conversations SET lead_id = target_id WHERE lead_id = loser_id;
      UPDATE public.appointments SET lead_id = target_id WHERE lead_id = loser_id;
      UPDATE public.lead_notifications SET lead_id = target_id WHERE lead_id = loser_id;
      UPDATE public.sheet_imported_rows SET lead_id = target_id WHERE lead_id = loser_id;
      DELETE FROM public.leads WHERE id = loser_id;
    END LOOP;

    -- Patch target with merged fields + canonical phone
    UPDATE public.leads
    SET
      name = COALESCE(NULLIF(trim(name), ''), best_name),
      email = COALESCE(NULLIF(trim(email), ''), best_email),
      interest = COALESCE(NULLIF(trim(interest), ''), best_interest),
      imported_from_sheet = COALESCE(imported_from_sheet, false) OR any_sheet,
      sheet_row_index = COALESCE(sheet_row_index, any_sheet_row),
      phone = '+' || grp.canon,
      updated_at = now()
    WHERE id = target_id;
  END LOOP;
END $$;

-- 3) Standardize all remaining leads to canonical format
UPDATE public.leads
SET phone = '+' || public.canonical_br_phone(phone)
WHERE phone IS NOT NULL
  AND public.canonical_br_phone(phone) IS NOT NULL
  AND phone <> '+' || public.canonical_br_phone(phone);
