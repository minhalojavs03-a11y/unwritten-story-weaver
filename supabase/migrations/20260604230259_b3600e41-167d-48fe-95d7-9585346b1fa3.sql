
-- Hide superadmin users from everyone except themselves and other superadmins.

-- profiles: restrictive policy on SELECT
CREATE POLICY "Hide superadmin profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
USING (
  id = auth.uid()
  OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
  OR NOT public.has_app_role(id, 'superadmin'::public.app_role)
);

-- tenant_memberships: restrictive policy on SELECT
CREATE POLICY "Hide superadmin memberships"
ON public.tenant_memberships
AS RESTRICTIVE
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
  OR NOT public.has_app_role(user_id, 'superadmin'::public.app_role)
);

-- tenant_members: restrictive policy on SELECT
CREATE POLICY "Hide superadmin tenant_members"
ON public.tenant_members
AS RESTRICTIVE
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
  OR user_id IS NULL
  OR NOT public.has_app_role(user_id, 'superadmin'::public.app_role)
);

-- Update SECURITY DEFINER RPC to also exclude superadmins for non-superadmin callers
CREATE OR REPLACE FUNCTION public.list_tenant_members_public(_tenant_id uuid)
 RETURNS TABLE(id uuid, username text, display_name text, role_label text, avatar_color text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.id, tm.username, tm.display_name, tm.role_label, tm.avatar_color, tm.avatar_url
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant_id
    AND tm.is_active = true
    AND (
      public.has_app_role(auth.uid(), 'superadmin'::public.app_role)
      OR tm.user_id = auth.uid()
      OR tm.user_id IS NULL
      OR NOT public.has_app_role(tm.user_id, 'superadmin'::public.app_role)
    )
$function$;
