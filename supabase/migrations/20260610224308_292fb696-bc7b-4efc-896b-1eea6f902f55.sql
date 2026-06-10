
CREATE OR REPLACE FUNCTION public.update_member_distribution(_member_id uuid, _receives_leads boolean, _min_credit_value numeric, _max_credit_value numeric, _daily_lead_limit integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_role tenant_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_members WHERE id = _member_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;

  v_role := public.get_tenant_role(auth.uid(), v_tenant);
  IF NOT public.has_app_role(auth.uid(), 'superadmin'::app_role)
     AND v_role NOT IN ('owner'::tenant_role, 'supervisor'::tenant_role) THEN
    RAISE EXCEPTION 'forbidden: only owner, supervisor or superadmin can edit distribution';
  END IF;

  IF _min_credit_value IS NOT NULL AND _max_credit_value IS NOT NULL
     AND _min_credit_value > _max_credit_value THEN
    RAISE EXCEPTION 'min greater than max';
  END IF;

  UPDATE public.tenant_members
     SET receives_leads = _receives_leads,
         min_credit_value = _min_credit_value,
         max_credit_value = _max_credit_value,
         daily_lead_limit = _daily_lead_limit,
         updated_at = now()
   WHERE id = _member_id;
END $function$;

CREATE OR REPLACE FUNCTION public.update_member_notification_channels(_member_id uuid, _notify_inapp boolean, _notify_whatsapp boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_members WHERE id = _member_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'member not found'; END IF;
  IF NOT public.has_app_role(auth.uid(), 'superadmin'::app_role)
     AND public.get_tenant_role(auth.uid(), v_tenant) NOT IN ('owner'::tenant_role, 'supervisor'::tenant_role) THEN
    RAISE EXCEPTION 'forbidden: only owner, supervisor or superadmin can edit notification channels';
  END IF;
  UPDATE public.tenant_members
     SET notify_inapp = coalesce(_notify_inapp, notify_inapp),
         notify_whatsapp = coalesce(_notify_whatsapp, notify_whatsapp),
         updated_at = now()
   WHERE id = _member_id;
END $function$;

CREATE OR REPLACE FUNCTION public.ensure_distribution_member(_tenant_id uuid, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_p public.profiles%ROWTYPE;
  v_membership record;
  v_username text;
  v_display_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.has_app_role(auth.uid(), 'superadmin'::app_role)
     AND public.get_tenant_role(auth.uid(), _tenant_id) NOT IN ('owner'::tenant_role, 'supervisor'::tenant_role) THEN
    RAISE EXCEPTION 'forbidden: only owner, supervisor or superadmin can manage distribution';
  END IF;

  SELECT id INTO v_id
    FROM public.tenant_members
   WHERE tenant_id = _tenant_id AND user_id = _user_id
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = _user_id;

  SELECT display_name, role INTO v_membership
    FROM public.tenant_memberships
   WHERE tenant_id = _tenant_id AND user_id = _user_id
   LIMIT 1;

  v_username := COALESCE(
    NULLIF(v_p.username, ''),
    split_part(NULLIF(v_p.email, ''), '@', 1),
    'consultor_' || replace(_user_id::text, '-', '')
  );

  v_display_name := COALESCE(
    NULLIF(v_membership.display_name, ''),
    NULLIF(v_p.display_name, ''),
    NULLIF(v_p.full_name, ''),
    NULLIF(v_p.email, ''),
    'Consultor'
  );

  INSERT INTO public.tenant_members (
    tenant_id, user_id, email, display_name, full_name, username,
    password_hash, role_label, avatar_url, avatar_color, phone,
    is_active, receives_leads, min_credit_value, max_credit_value,
    daily_lead_limit, notify_inapp, notify_whatsapp
  ) VALUES (
    _tenant_id, _user_id, v_p.email, v_display_name, v_p.full_name, v_username,
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    COALESCE(NULLIF(v_p.role_label, ''), initcap(COALESCE(v_membership.role::text, 'consultant'))),
    v_p.avatar_url, COALESCE(v_p.avatar_color, '#1E40AF'), v_p.phone,
    true, false, 300000, 2000000, NULL, true, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_distribution_consultants(_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, user_id uuid, tenant_id uuid, display_name text, username text, role_label text, avatar_url text, avatar_color text, is_active boolean, receives_leads boolean, min_credit_value numeric, max_credit_value numeric, daily_lead_limit integer, notify_inapp boolean, notify_whatsapp boolean, phone text)
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
      d.is_active, d.receives_leads, d.min_credit_value, d.max_credit_value,
      d.daily_lead_limit, d.notify_inapp, d.notify_whatsapp
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
    d.min_credit_value, d.max_credit_value, d.daily_lead_limit,
    COALESCE(d.notify_inapp, true) AS notify_inapp,
    COALESCE(d.notify_whatsapp, true) AS notify_whatsapp,
    COALESCE(NULLIF(d.phone, ''), NULLIF(ps.profile_phone, '')) AS phone
  FROM person_source ps
  LEFT JOIN member_source d ON d.user_id = ps.user_id AND d.tenant_id = ps.tenant_id
  WHERE d.id IS NOT NULL
     OR ps.membership_role <> 'owner'
$function$;
