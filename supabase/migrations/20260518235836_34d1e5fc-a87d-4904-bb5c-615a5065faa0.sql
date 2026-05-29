CREATE OR REPLACE FUNCTION public.verify_tenant_member(_username text, _password text)
RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE profiles.id = auth.uid();
  IF _tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, m.username, m.display_name, m.role_label, m.avatar_color
  FROM public.tenant_members m
  WHERE m.tenant_id = _tenant
    AND m.is_active = true
    AND lower(m.username) = lower(trim(_username))
    AND m.password_hash = extensions.crypt(_password, m.password_hash)
  LIMIT 1;
END;
$$;