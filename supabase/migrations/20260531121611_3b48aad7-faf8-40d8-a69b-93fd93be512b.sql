WITH first_membership AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    tenant_id,
    display_name
  FROM public.tenant_memberships
  ORDER BY user_id, created_at ASC
)
UPDATE public.profiles p
SET
  tenant_id = fm.tenant_id,
  display_name = COALESCE(NULLIF(p.display_name, ''), fm.display_name, p.display_name),
  updated_at = now()
FROM first_membership fm
WHERE p.id = fm.user_id
  AND (p.tenant_id IS DISTINCT FROM fm.tenant_id OR (p.display_name IS NULL AND fm.display_name IS NOT NULL));

CREATE OR REPLACE FUNCTION public.accept_role_invite(_token uuid)
RETURNS TABLE(tenant_id uuid, role tenant_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.tenant_role_invites%ROWTYPE;
  v_email text;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v FROM public.tenant_role_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido'; END IF;
  IF NOT v.is_active THEN RAISE EXCEPTION 'Link desativado'; END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN RAISE EXCEPTION 'Link expirado'; END IF;
  IF v.max_uses IS NOT NULL AND v.uses_count >= v.max_uses THEN RAISE EXCEPTION 'Limite de usos atingido'; END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já pertence a uma equipe';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
  VALUES (v.tenant_id, auth.uid(), v.role, v.role_label);

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  v_name := COALESCE(NULLIF(v.role_label, ''), split_part(COALESCE(v_email, ''), '@', 1), 'Usuário');

  UPDATE public.profiles
  SET
    tenant_id = v.tenant_id,
    display_name = COALESCE(NULLIF(display_name, ''), v_name),
    updated_at = now()
  WHERE id = auth.uid();

  UPDATE public.tenant_role_invites SET uses_count = uses_count + 1, updated_at = now() WHERE id = v.id;

  RETURN QUERY SELECT v.tenant_id, v.role;
END $function$;

GRANT EXECUTE ON FUNCTION public.accept_role_invite(uuid) TO authenticated;