INSERT INTO public.user_roles (user_id, role)
SELECT '0b138840-e373-45d3-b20b-0d100d4515da', 'superadmin'::app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = '0b138840-e373-45d3-b20b-0d100d4515da' AND role = 'superadmin'
);