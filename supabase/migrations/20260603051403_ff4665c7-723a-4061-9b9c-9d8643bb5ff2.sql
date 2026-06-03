CREATE OR REPLACE FUNCTION public.ensure_distribution_member(_tenant_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     AND public.get_tenant_role(auth.uid(), _tenant_id) <> 'owner'::tenant_role THEN
    RAISE EXCEPTION 'forbidden: only owner or superadmin can manage distribution';
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
    tenant_id,
    user_id,
    email,
    display_name,
    full_name,
    username,
    password_hash,
    role_label,
    avatar_url,
    avatar_color,
    phone,
    is_active,
    receives_leads,
    min_credit_value,
    max_credit_value,
    daily_lead_limit,
    notify_inapp,
    notify_whatsapp
  ) VALUES (
    _tenant_id,
    _user_id,
    v_p.email,
    v_display_name,
    v_p.full_name,
    v_username,
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    COALESCE(NULLIF(v_p.role_label, ''), initcap(COALESCE(v_membership.role::text, 'consultant'))),
    v_p.avatar_url,
    COALESCE(v_p.avatar_color, '#1E40AF'),
    v_p.phone,
    true,
    false,
    300000,
    2000000,
    NULL,
    true,
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_distribution_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_distribution_consultants(_tenant_id uuid)
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
    SELECT (
      auth.uid() IS NOT NULL
      AND (
        public.has_app_role(auth.uid(), 'superadmin'::app_role)
        OR public.get_tenant_role(auth.uid(), _tenant_id) = 'owner'::tenant_role
      )
    ) AS ok
  ), membership_rows AS (
    SELECT
      d.id,
      tm.user_id,
      tm.tenant_id,
      COALESCE(NULLIF(d.display_name, ''), NULLIF(tm.display_name, ''), NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Consultor') AS display_name,
      COALESCE(NULLIF(d.username, ''), NULLIF(p.username, ''), split_part(NULLIF(p.email, ''), '@', 1)) AS username,
      COALESCE(NULLIF(d.role_label, ''), NULLIF(p.role_label, ''), initcap(tm.role::text), 'Consultor') AS role_label,
      COALESCE(d.avatar_url, p.avatar_url) AS avatar_url,
      COALESCE(d.avatar_color, tm.avatar_color, p.avatar_color, '#1E40AF') AS avatar_color,
      COALESCE(d.is_active, true) AS is_active,
      COALESCE(d.receives_leads, false) AS receives_leads,
      COALESCE(d.min_credit_value, 300000) AS min_credit_value,
      COALESCE(d.max_credit_value, 2000000) AS max_credit_value,
      d.daily_lead_limit,
      COALESCE(d.notify_inapp, true) AS notify_inapp,
      COALESCE(d.notify_whatsapp, true) AS notify_whatsapp,
      COALESCE(NULLIF(d.phone, ''), NULLIF(p.phone, '')) AS phone
    FROM public.tenant_memberships tm
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    LEFT JOIN public.tenant_members d ON d.tenant_id = tm.tenant_id AND d.user_id = tm.user_id
    CROSS JOIN allowed
    WHERE allowed.ok
      AND tm.tenant_id = _tenant_id
      AND tm.role IN ('consultant'::tenant_role, 'attendant'::tenant_role)
  ), legacy_rows AS (
    SELECT
      d.id,
      d.user_id,
      d.tenant_id,
      COALESCE(NULLIF(d.display_name, ''), NULLIF(d.full_name, ''), NULLIF(d.username, ''), 'Consultor') AS display_name,
      d.username,
      COALESCE(NULLIF(d.role_label, ''), 'Consultor') AS role_label,
      d.avatar_url,
      COALESCE(d.avatar_color, '#1E40AF') AS avatar_color,
      d.is_active,
      COALESCE(d.receives_leads, false) AS receives_leads,
      COALESCE(d.min_credit_value, 300000) AS min_credit_value,
      COALESCE(d.max_credit_value, 2000000) AS max_credit_value,
      d.daily_lead_limit,
      COALESCE(d.notify_inapp, true) AS notify_inapp,
      COALESCE(d.notify_whatsapp, true) AS notify_whatsapp,
      d.phone
    FROM public.tenant_members d
    CROSS JOIN allowed
    WHERE allowed.ok
      AND d.tenant_id = _tenant_id
      AND d.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships tm
        WHERE tm.tenant_id = d.tenant_id
          AND tm.user_id = d.user_id
          AND tm.role IN ('consultant'::tenant_role, 'attendant'::tenant_role)
      )
      AND lower(COALESCE(d.role_label, '')) NOT IN ('dono', 'owner', 'proprietário', 'proprietario')
  )
  SELECT * FROM membership_rows
  UNION ALL
  SELECT * FROM legacy_rows
  ORDER BY display_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_distribution_consultants(uuid) TO authenticated;