REVOKE EXECUTE ON FUNCTION public.bootstrap_first_superadmin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_my_tenant(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_tenant(TEXT, TEXT) TO authenticated;