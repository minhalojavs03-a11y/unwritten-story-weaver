ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS distribution_priority integer NOT NULL DEFAULT 100;

-- ordem inicial equivalente às regras atuais
UPDATE public.tenant_members SET distribution_priority = 10
 WHERE lower(coalesce(display_name,'')) LIKE '%micaelly%';
UPDATE public.tenant_members SET distribution_priority = 11
 WHERE lower(coalesce(display_name,'')) LIKE '%nilton%' OR lower(coalesce(username,'')) LIKE '%nilton%' OR lower(coalesce(username,'')) LIKE '%ilton|_%';
UPDATE public.tenant_members SET distribution_priority = 12
 WHERE lower(coalesce(display_name,'')) LIKE '%david%' OR lower(coalesce(username,'')) LIKE '%david%';
UPDATE public.tenant_members SET distribution_priority = 900
 WHERE lower(coalesce(display_name,'')) LIKE '%diessica%' OR lower(coalesce(display_name,'')) LIKE '%diéssica%';

CREATE OR REPLACE FUNCTION public.set_distribution_priority(_orders jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _mid uuid;
  _pos integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_orders)
  LOOP
    _mid := (_item->>'member_id')::uuid;
    _pos := (_item->>'priority')::int;
    UPDATE public.tenant_members tm
       SET distribution_priority = _pos, updated_at = now()
     WHERE tm.id = _mid
       AND (
         public.has_app_role(auth.uid(), 'superadmin'::app_role)
         OR public.get_tenant_role(auth.uid(), tm.tenant_id) IN ('owner'::tenant_role, 'supervisor'::tenant_role)
       );
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_distribution_priority(jsonb) TO authenticated;

-- lista passa a devolver a ordem
DROP FUNCTION IF EXISTS public.list_distribution_consultants(uuid);
CREATE OR REPLACE FUNCTION public.list_distribution_consultants(_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, user_id uuid, tenant_id uuid, display_name text, username text, role_label text, avatar_url text, avatar_color text, is_active boolean, receives_leads boolean, receives_leads_02 boolean, min_credit_value numeric, max_credit_value numeric, daily_lead_limit integer, notify_inapp boolean, notify_whatsapp boolean, phone text, distribution_priority integer, receive_leads_when_offline boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT
      auth.uid() IS NOT NULL AS signed_in,
      public.has_app_role(auth.uid(), 'superadmin'::app_role) AS is_superadmin,
      _tenant_id AS requested_tenant
  ), membership_source AS (
    SELECT
      tm.tenant_id, tm.user_id, tm.role::text AS membership_role,
      tm.display_name AS membership_display_name, tm.avatar_color AS membership_avatar_color,
      p.email, p.display_name AS profile_display_name, p.full_name,
      p.username AS profile_username, p.role_label AS profile_role_label,
      p.avatar_url AS profile_avatar_url, p.avatar_color AS profile_avatar_color,
      p.phone AS profile_phone
    FROM public.tenant_memberships tm
    JOIN allowed a ON a.signed_in
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE (a.is_superadmin OR public.get_tenant_role(auth.uid(), tm.tenant_id) IN ('owner'::tenant_role, 'supervisor'::tenant_role))
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR tm.tenant_id = a.requested_tenant)
      AND tm.role <> 'owner'::tenant_role
      AND lower(coalesce(p.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
      AND NOT public.has_app_role(tm.user_id, 'superadmin'::app_role)
  ), profile_source AS (
    SELECT
      p.tenant_id, p.id AS user_id, 'consultant'::text AS membership_role,
      NULL::text AS membership_display_name, NULL::text AS membership_avatar_color,
      p.email, p.display_name AS profile_display_name, p.full_name,
      p.username AS profile_username, p.role_label AS profile_role_label,
      p.avatar_url AS profile_avatar_url, p.avatar_color AS profile_avatar_color,
      p.phone AS profile_phone
    FROM public.profiles p
    JOIN allowed a ON a.signed_in
    WHERE p.tenant_id IS NOT NULL
      AND (a.is_superadmin OR public.get_tenant_role(auth.uid(), p.tenant_id) IN ('owner'::tenant_role, 'supervisor'::tenant_role))
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR p.tenant_id = a.requested_tenant)
      AND lower(coalesce(p.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
      AND NOT public.has_app_role(p.id, 'superadmin'::app_role)
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p.tenant_id AND tm.user_id = p.id
      )
  ), person_source AS (
    SELECT * FROM membership_source
    UNION ALL
    SELECT * FROM profile_source
  ), member_source AS (
    SELECT
      d.id, d.user_id, d.tenant_id, d.email, d.display_name, d.full_name,
      d.username, d.role_label, d.avatar_url, d.avatar_color, d.phone,
      d.is_active, d.receives_leads, d.receives_leads_02, d.min_credit_value, d.max_credit_value,
      d.daily_lead_limit, d.notify_inapp, d.notify_whatsapp,
      d.distribution_priority, d.receive_leads_when_offline
    FROM public.tenant_members d
    JOIN allowed a ON a.signed_in
    WHERE d.is_active = true
      AND (a.is_superadmin OR public.get_tenant_role(auth.uid(), d.tenant_id) IN ('owner'::tenant_role, 'supervisor'::tenant_role))
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR d.tenant_id = a.requested_tenant)
      AND lower(coalesce(d.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
  )
  SELECT
    d.id,
    ps.user_id,
    ps.tenant_id,
    COALESCE(NULLIF(d.display_name, ''), NULLIF(ps.membership_display_name, ''), NULLIF(ps.profile_display_name, ''), NULLIF(ps.full_name, ''), NULLIF(ps.email, ''), 'Consultor') AS display_name,
    COALESCE(NULLIF(d.username, ''), NULLIF(ps.profile_username, ''), split_part(NULLIF(ps.email, ''), '@', 1)) AS username,
    COALESCE(NULLIF(d.role_label, ''), NULLIF(ps.profile_role_label, ''), 'Consultor') AS role_label,
    COALESCE(NULLIF(d.avatar_url, ''), NULLIF(ps.profile_avatar_url, '')) AS avatar_url,
    COALESCE(NULLIF(d.avatar_color, ''), NULLIF(ps.membership_avatar_color, ''), NULLIF(ps.profile_avatar_color, '')) AS avatar_color,
    COALESCE(d.is_active, true) AS is_active,
    COALESCE(d.receives_leads, false) AS receives_leads,
    COALESCE(d.receives_leads_02, false) AS receives_leads_02,
    d.min_credit_value, d.max_credit_value, d.daily_lead_limit,
    COALESCE(d.notify_inapp, true) AS notify_inapp,
    COALESCE(d.notify_whatsapp, true) AS notify_whatsapp,
    COALESCE(NULLIF(d.phone, ''), NULLIF(ps.profile_phone, '')) AS phone,
    COALESCE(d.distribution_priority, 100) AS distribution_priority,
    COALESCE(d.receive_leads_when_offline, false) AS receive_leads_when_offline
  FROM person_source ps
  LEFT JOIN member_source d ON d.user_id = ps.user_id AND d.tenant_id = ps.tenant_id
  WHERE d.id IS NOT NULL
     OR ps.membership_role <> 'owner'
$function$;

-- distribuição segue a ordem manual
CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _picked uuid;
  _picked_user uuid;
  _credit numeric;
  _source_label text;
  _is_leads02 boolean;
  _sp_midnight timestamptz;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.kind, 'lead') = 'outros' THEN
    RETURN NEW;
  END IF;

  _credit := NEW.credit_value;
  IF _credit IS NULL THEN
    _credit := public.parse_credit_from_interest(NEW.interest);
    IF _credit IS NOT NULL THEN
      NEW.credit_value := _credit;
    END IF;
  END IF;

  _source_label := NULLIF(NEW.metadata->>'sheet_source_label', '');
  _is_leads02 := (_source_label = 'Leads 02');
  _sp_midnight := ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  -- 1) Ordem manual: o primeiro da lista enche a cota antes de liberar o próximo.
  WITH candidates AS (
    SELECT
      tm.id,
      tm.user_id,
      tm.distribution_priority AS prio,
      COALESCE(tm.daily_lead_limit, 1) AS lim,
      (SELECT count(*) FROM public.leads l
        WHERE l.tenant_id = tm.tenant_id
          AND l.kind = 'lead'
          AND l.assigned_member_id = tm.id
          AND l.assigned_member_at >= _sp_midnight) AS cnt
    FROM public.tenant_members tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.is_active = true
      AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
      AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
      AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
      AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
      AND ((_credit IS NULL) OR tm.max_credit_value IS NULL OR _credit <= tm.max_credit_value)
      AND ((_credit IS NULL) OR tm.min_credit_value IS NULL OR _credit >= tm.min_credit_value)
  )
  SELECT id, user_id INTO _picked, _picked_user
  FROM candidates
  WHERE cnt < lim
  ORDER BY prio ASC, cnt ASC, random()
  LIMIT 1;

  -- 2) Fallback: todos na cota — segue a mesma ordem, com menor carga primeiro.
  IF _picked IS NULL THEN
    WITH candidates AS (
      SELECT
        tm.id,
        tm.user_id,
        tm.distribution_priority AS prio,
        (SELECT count(*) FROM public.leads l
          WHERE l.tenant_id = tm.tenant_id
            AND l.kind = 'lead'
            AND l.assigned_member_id = tm.id
            AND l.assigned_member_at >= _sp_midnight) AS cnt
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.is_active = true
        AND ((_is_leads02 AND tm.receives_leads_02 = true) OR (NOT _is_leads02 AND tm.receives_leads = true))
        AND lower(coalesce(tm.role_label, '')) LIKE '%consultor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%supervisor%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%aprendiz%'
        AND lower(coalesce(tm.role_label, '')) NOT LIKE '%dono%'
        AND lower(coalesce(tm.display_name, '')) NOT LIKE '%teste%'
    )
    SELECT id, user_id INTO _picked, _picked_user
    FROM candidates
    ORDER BY cnt ASC, prio ASC, random()
    LIMIT 1;
  END IF;

  IF _picked IS NOT NULL THEN
    NEW.assigned_member_id := _picked;
    NEW.assigned_member_at := now();
    IF _picked_user IS NOT NULL THEN
      NEW.assigned_to := _picked_user;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;