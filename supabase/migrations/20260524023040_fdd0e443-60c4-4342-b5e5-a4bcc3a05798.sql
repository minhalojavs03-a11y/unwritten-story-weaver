
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS monthly_goal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_whatsapp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DROP FUNCTION IF EXISTS public.list_tenant_members_public();
CREATE FUNCTION public.list_tenant_members_public()
 RETURNS TABLE(
   id uuid, username text, display_name text, role_label text,
   avatar_color text, avatar_url text, bio text, phone text,
   last_seen_at timestamptz
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.username, m.display_name, m.role_label,
         m.avatar_color, m.avatar_url, m.bio, m.phone, m.last_seen_at
  FROM public.tenant_members m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE m.tenant_id = p.tenant_id AND m.is_active = true
  ORDER BY m.display_name;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_tenant_member(
  _member_id uuid,
  _full_name text DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _role_label text DEFAULT NULL,
  _bio text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _avatar_color text DEFAULT NULL,
  _avatar_url text DEFAULT NULL,
  _monthly_goal integer DEFAULT NULL,
  _notification_whatsapp boolean DEFAULT NULL,
  _notification_email boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _member_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = auth.uid();
  IF _tenant IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  SELECT tenant_id INTO _member_tenant FROM public.tenant_members WHERE id = _member_id;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN
    RAISE EXCEPTION 'invalid member';
  END IF;

  UPDATE public.tenant_members SET
    full_name = COALESCE(_full_name, full_name),
    display_name = COALESCE(NULLIF(_display_name, ''), display_name),
    role_label = COALESCE(_role_label, role_label),
    bio = COALESCE(_bio, bio),
    phone = COALESCE(_phone, phone),
    avatar_color = COALESCE(NULLIF(_avatar_color, ''), avatar_color),
    avatar_url = COALESCE(_avatar_url, avatar_url),
    monthly_goal = COALESCE(_monthly_goal, monthly_goal),
    notification_whatsapp = COALESCE(_notification_whatsapp, notification_whatsapp),
    notification_email = COALESCE(_notification_email, notification_email),
    updated_at = now()
  WHERE id = _member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_member_last_seen(_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _tenant uuid; _member_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO _member_tenant FROM public.tenant_members WHERE id = _member_id;
  IF _member_tenant IS NULL OR _member_tenant <> _tenant THEN RETURN; END IF;
  UPDATE public.tenant_members SET last_seen_at = now() WHERE id = _member_id;
END;
$$;

DROP POLICY IF EXISTS "Tenant staff manage member avatars" ON storage.objects;
CREATE POLICY "Tenant staff manage member avatars"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'members'
  AND EXISTS (
    SELECT 1 FROM public.tenant_members m
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE m.id::text = (storage.foldername(name))[2]
      AND m.tenant_id = p.tenant_id
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'members'
  AND EXISTS (
    SELECT 1 FROM public.tenant_members m
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE m.id::text = (storage.foldername(name))[2]
      AND m.tenant_id = p.tenant_id
  )
);
