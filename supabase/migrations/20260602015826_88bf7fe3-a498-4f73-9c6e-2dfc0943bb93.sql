CREATE OR REPLACE FUNCTION public.get_superadmin_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'superadmin'::app_role;
$$;

GRANT EXECUTE ON FUNCTION public.get_superadmin_user_ids() TO authenticated;