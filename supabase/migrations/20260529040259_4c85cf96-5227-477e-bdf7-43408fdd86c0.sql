INSERT INTO public.user_roles (user_id, role)
SELECT id, 'superadmin'::app_role FROM auth.users WHERE email='sparckonmeta@gmail.com'
ON CONFLICT DO NOTHING;