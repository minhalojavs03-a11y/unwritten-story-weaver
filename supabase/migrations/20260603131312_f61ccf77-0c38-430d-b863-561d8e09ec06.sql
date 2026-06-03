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