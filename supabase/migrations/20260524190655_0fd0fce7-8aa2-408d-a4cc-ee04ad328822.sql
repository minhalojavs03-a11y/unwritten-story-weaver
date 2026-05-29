DROP FUNCTION IF EXISTS public.list_tenant_members_public();

CREATE FUNCTION public.list_tenant_members_public()
 RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text, avatar_url text, bio text, phone text, last_seen_at timestamp with time zone, receives_leads boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.username, m.display_name, m.role_label,
         m.avatar_color, m.avatar_url, m.bio, m.phone, m.last_seen_at, m.receives_leads
  FROM public.tenant_members m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE m.tenant_id = p.tenant_id AND m.is_active = true
  ORDER BY m.display_name;
$function$;