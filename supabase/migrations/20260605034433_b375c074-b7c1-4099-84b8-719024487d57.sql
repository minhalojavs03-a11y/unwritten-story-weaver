-- Remove conta heliopintos completamente
DELETE FROM public.user_roles WHERE user_id = '3816c4d0-1688-4d89-ae4c-05fac5c63f72';
DELETE FROM public.tenant_memberships WHERE user_id = '3816c4d0-1688-4d89-ae4c-05fac5c63f72';
DELETE FROM public.tenant_members WHERE user_id = '3816c4d0-1688-4d89-ae4c-05fac5c63f72';
DELETE FROM public.profiles WHERE id = '3816c4d0-1688-4d89-ae4c-05fac5c63f72';
DELETE FROM auth.users WHERE id = '3816c4d0-1688-4d89-ae4c-05fac5c63f72';