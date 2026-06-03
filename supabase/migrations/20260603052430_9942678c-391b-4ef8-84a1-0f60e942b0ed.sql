CREATE OR REPLACE FUNCTION public.list_distribution_consultants(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  tenant_id uuid,
  display_name text,
  username text,
  role_label text,
  avatar_url text,
  avatar_color text,
  is_active boolean,
  receives_leads boolean,
  min_credit_value numeric,
  max_credit_value numeric,
  daily_lead_limit integer,
  notify_inapp boolean,
  notify_whatsapp boolean,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT
      auth.uid() IS NOT NULL AS signed_in,
      public.has_app_role(auth.uid(), 'superadmin'::app_role) AS is_superadmin,
      _tenant_id AS requested_tenant
  ), membership_source AS (
    SELECT
      tm.tenant_id,
      tm.user_id,
      tm.role::text AS membership_role,
      tm.display_name AS membership_display_name,
      tm.avatar_color AS membership_avatar_color,
      p.email,
      p.display_name AS profile_display_name,
      p.full_name,
      p.username AS profile_username,
      p.role_label AS profile_role_label,
      p.avatar_url AS profile_avatar_url,
      p.avatar_color AS profile_avatar_color,
      p.phone AS profile_phone
    FROM public.tenant_memberships tm
    JOIN allowed a ON a.signed_in
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE (a.is_superadmin OR public.get_tenant_role(auth.uid(), tm.tenant_id) = 'owner'::tenant_role)
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR tm.tenant_id = a.requested_tenant)
      AND tm.role <> 'owner'::tenant_role
      AND lower(coalesce(p.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
      AND NOT public.has_app_role(tm.user_id, 'superadmin'::app_role)
  ), profile_source AS (
    SELECT
      p.tenant_id,
      p.id AS user_id,
      'consultant'::text AS membership_role,
      NULL::text AS membership_display_name,
      NULL::text AS membership_avatar_color,
      p.email,
      p.display_name AS profile_display_name,
      p.full_name,
      p.username AS profile_username,
      p.role_label AS profile_role_label,
      p.avatar_url AS profile_avatar_url,
      p.avatar_color AS profile_avatar_color,
      p.phone AS profile_phone
    FROM public.profiles p
    JOIN allowed a ON a.signed_in
    WHERE p.tenant_id IS NOT NULL
      AND (a.is_superadmin OR public.get_tenant_role(auth.uid(), p.tenant_id) = 'owner'::tenant_role)
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR p.tenant_id = a.requested_tenant)
      AND lower(coalesce(p.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
      AND NOT public.has_app_role(p.id, 'superadmin'::app_role)
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p.tenant_id
          AND tm.user_id = p.id
      )
  ), person_source AS (
    SELECT * FROM membership_source
    UNION ALL
    SELECT * FROM profile_source
  ), member_source AS (
    SELECT
      d.id,
      d.user_id,
      d.tenant_id,
      d.email,
      d.display_name,
      d.full_name,
      d.username,
      d.role_label,
      d.avatar_url,
      d.avatar_color,
      d.phone,
      d.is_active,
      d.receives_leads,
      d.min_credit_value,
      d.max_credit_value,
      d.daily_lead_limit,
      d.notify_inapp,
      d.notify_whatsapp
    FROM public.tenant_members d
    JOIN allowed a ON a.signed_in
    WHERE d.is_active = true
      AND (a.is_superadmin OR public.get_tenant_role(auth.uid(), d.tenant_id) = 'owner'::tenant_role)
      AND (a.is_superadmin OR a.requested_tenant IS NULL OR d.tenant_id = a.requested_tenant)
      AND lower(coalesce(d.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario', 'superadmin')
  )
  SELECT
    d.id,
    ps.user_id,
    ps.tenant_id,
    COALESCE(NULLIF(d.display_name, ''), NULLIF(ps.membership_display_name, ''), NULLIF(ps.profile_display_name, ''), NULLIF(ps.full_name, ''), NULLIF(ps.email, ''), 'Consultor') AS display_name,
    COALESCE(NULLIF(d.username, ''), NULLIF(ps.profile_username, ''), split_part(NULLIF(ps.email, ''), '@', 1)) AS username,
    COALESCE(NULLIF(d.role_label, ''), NULLIF(ps.profile_role_label, ''), initcap(ps.membership_role), 'Consultor') AS role_label,
    COALESCE(d.avatar_url, ps.profile_avatar_url) AS avatar_url,
    COALESCE(d.avatar_color, ps.membership_avatar_color, ps.profile_avatar_color, '#1E40AF') AS avatar_color,
    COALESCE(d.is_active, true) AS is_active,
    COALESCE(d.receives_leads, false) AS receives_leads,
    COALESCE(d.min_credit_value, 300000) AS min_credit_value,
    COALESCE(d.max_credit_value, 2000000) AS max_credit_value,
    d.daily_lead_limit,
    COALESCE(d.notify_inapp, true) AS notify_inapp,
    COALESCE(d.notify_whatsapp, true) AS notify_whatsapp,
    COALESCE(NULLIF(d.phone, ''), NULLIF(ps.profile_phone, '')) AS phone
  FROM person_source ps
  LEFT JOIN public.tenant_members d ON d.tenant_id = ps.tenant_id AND d.user_id = ps.user_id

  UNION ALL

  SELECT
    ms.id,
    ms.user_id,
    ms.tenant_id,
    COALESCE(NULLIF(ms.display_name, ''), NULLIF(ms.full_name, ''), NULLIF(ms.email, ''), NULLIF(ms.username, ''), 'Consultor') AS display_name,
    ms.username,
    COALESCE(NULLIF(ms.role_label, ''), 'Consultor') AS role_label,
    ms.avatar_url,
    COALESCE(ms.avatar_color, '#1E40AF') AS avatar_color,
    ms.is_active,
    COALESCE(ms.receives_leads, false) AS receives_leads,
    COALESCE(ms.min_credit_value, 300000) AS min_credit_value,
    COALESCE(ms.max_credit_value, 2000000) AS max_credit_value,
    ms.daily_lead_limit,
    COALESCE(ms.notify_inapp, true) AS notify_inapp,
    COALESCE(ms.notify_whatsapp, true) AS notify_whatsapp,
    ms.phone
  FROM member_source ms
  WHERE ms.user_id IS NULL
     OR NOT EXISTS (
      SELECT 1
      FROM person_source ps
      WHERE ps.tenant_id = ms.tenant_id
        AND ps.user_id = ms.user_id
    )
  ORDER BY display_name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_distribution_consultants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_distribution_consultants(uuid) TO authenticated;