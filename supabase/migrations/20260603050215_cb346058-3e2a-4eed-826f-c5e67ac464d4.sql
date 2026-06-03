
-- 1) Vincular tenant_members ao usuário do auth
ALTER TABLE public.tenant_members ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_tenant ON public.tenant_members(tenant_id, user_id);

-- 2) Backfill por e-mail
UPDATE public.tenant_members tm
   SET user_id = p.id
  FROM public.profiles p
 WHERE tm.user_id IS NULL
   AND tm.email IS NOT NULL
   AND lower(tm.email) = lower(p.email);

-- 3) RPC: garante uma linha em tenant_members para um (tenant,user)
CREATE OR REPLACE FUNCTION public.ensure_distribution_member(_tenant_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_p public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_app_role(auth.uid(),'superadmin'::app_role)
     AND public.get_tenant_role(auth.uid(), _tenant_id) <> 'owner'::tenant_role THEN
    RAISE EXCEPTION 'forbidden: only owner or superadmin can manage distribution';
  END IF;

  SELECT id INTO v_id
    FROM public.tenant_members
   WHERE tenant_id = _tenant_id AND user_id = _user_id
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = _user_id;

  INSERT INTO public.tenant_members (
    tenant_id, user_id, email, display_name, full_name, username,
    role_label, avatar_url, avatar_color, phone, is_active,
    receives_leads, notify_inapp, notify_whatsapp
  ) VALUES (
    _tenant_id, _user_id, v_p.email, v_p.display_name, v_p.full_name, v_p.username,
    COALESCE(v_p.role_label, 'Consultor'),
    v_p.avatar_url, COALESCE(v_p.avatar_color, '#1E40AF'), v_p.phone, true,
    false, true, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_distribution_member(uuid, uuid) TO authenticated;
