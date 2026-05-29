-- Função: extrai o valor da carta de um texto livre (ex.: "r$_300_mil_-_r$_500_mil", "1 milhão", "800k")
CREATE OR REPLACE FUNCTION public.parse_credit_from_interest(_raw text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  s text;
  m text[];
  num numeric;
  suf text;
  v numeric;
  best numeric := NULL;
  pos int := 1;
  match_result text[];
BEGIN
  IF _raw IS NULL OR length(trim(_raw)) = 0 THEN RETURN NULL; END IF;

  s := lower(_raw);
  s := translate(s, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  s := replace(s, '_', ' ');

  FOR m IN
    SELECT regexp_matches(
      s,
      '([0-9]+(?:[.,][0-9]+)?)\s*(kk|mm|milhoes|milhao|milh|mil|mi|k)?',
      'g'
    )
  LOOP
    num := NULLIF(replace(m[1], ',', '.'), '')::numeric;
    IF num IS NULL THEN CONTINUE; END IF;
    suf := COALESCE(m[2], '');

    IF suf IN ('kk','mm','mi','milhao','milhoes','milh') THEN
      v := num * 1000000;
    ELSIF suf IN ('mil','k') THEN
      v := num * 1000;
    ELSIF num < 1000 AND s ~ '\mmil\M' THEN
      v := num * 1000;
    ELSE
      v := num;
    END IF;

    IF v >= 1000 THEN
      best := GREATEST(COALESCE(best, 0), v);
    END IF;
  END LOOP;

  RETURN best;
END;
$$;

-- Trigger de atribuição: agora usa parse_credit_from_interest como fallback,
-- e preenche NEW.credit_value quando ele vem nulo mas o texto do interesse permite extrair.
CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _picked uuid;
  _credit numeric;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _credit := NEW.credit_value;
  IF _credit IS NULL THEN
    _credit := public.parse_credit_from_interest(NEW.interest);
    IF _credit IS NOT NULL THEN
      NEW.credit_value := _credit;
    END IF;
  END IF;

  SELECT tm.id INTO _picked
  FROM public.tenant_members tm
  WHERE tm.tenant_id = NEW.tenant_id
    AND tm.is_active = true
    AND tm.receives_leads = true
    AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
    AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
    AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
    AND lower(coalesce(tm.display_name, '')) NOT LIKE '%test %'
    AND (
      _credit IS NULL
      OR tm.max_credit_value IS NULL
      OR _credit <= tm.max_credit_value
    )
  ORDER BY
    -- prioriza quem tem teto mais próximo (menor max_credit_value que ainda comporta)
    CASE WHEN _credit IS NULL THEN 1 ELSE 0 END,
    tm.max_credit_value ASC NULLS LAST,
    random()
  LIMIT 1;

  IF _picked IS NOT NULL THEN
    NEW.assigned_member_id := _picked;
    NEW.assigned_member_at := now();
    IF NEW.stage IS NULL OR NEW.stage = 'novo' THEN
      NEW.stage := 'atendimento';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;