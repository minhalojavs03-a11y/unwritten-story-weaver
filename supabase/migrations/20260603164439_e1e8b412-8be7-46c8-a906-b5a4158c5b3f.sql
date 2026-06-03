
-- Unique para upsert por message_id funcionar
CREATE UNIQUE INDEX IF NOT EXISTS coaching_message_analysis_message_id_key
  ON public.coaching_message_analysis(message_id);

-- Garante um tenant_members para o dono do tenant (usado como fallback de coaching)
CREATE OR REPLACE FUNCTION public.ensure_owner_member(_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_p public.profiles%ROWTYPE;
  v_username text;
  v_display text;
BEGIN
  SELECT user_id INTO v_owner
    FROM public.tenant_memberships
   WHERE tenant_id = _tenant_id AND role = 'owner'::tenant_role
   ORDER BY created_at ASC LIMIT 1;
  IF v_owner IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.tenant_members
   WHERE tenant_id = _tenant_id AND user_id = v_owner LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = v_owner;
  v_username := COALESCE(NULLIF(v_p.username,''), split_part(NULLIF(v_p.email,''),'@',1), 'owner_'||replace(v_owner::text,'-',''));
  v_display  := COALESCE(NULLIF(v_p.display_name,''), NULLIF(v_p.full_name,''), NULLIF(v_p.email,''), 'Dono');

  INSERT INTO public.tenant_members(
    tenant_id, user_id, email, display_name, full_name, username,
    password_hash, role_label, avatar_url, avatar_color, phone,
    is_active, receives_leads, min_credit_value, max_credit_value
  ) VALUES (
    _tenant_id, v_owner, v_p.email, v_display, v_p.full_name, v_username,
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    'Dono', v_p.avatar_url, COALESCE(v_p.avatar_color,'#1E40AF'), v_p.phone,
    true, false, 300000, 2000000
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_owner_member(uuid) TO service_role, authenticated;
