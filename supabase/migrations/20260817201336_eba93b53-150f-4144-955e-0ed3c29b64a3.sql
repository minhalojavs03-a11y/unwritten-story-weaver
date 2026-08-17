-- 1) Reset password + confirm email for both Luiz accounts
UPDATE auth.users
SET encrypted_password = crypt('Feracon@2026', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmation_token = '',
    recovery_token = '',
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    updated_at = now(),
    banned_until = NULL
WHERE email IN ('lgdiazpinheiro@gmail.com', 'lgdiazpinheiro@hotmail.com');

-- 2) Ensure profile rows for both accounts point at Feracon tenant
INSERT INTO public.profiles (id, email, display_name, full_name, tenant_id, role_label)
SELECT u.id, u.email, 'Luiz Guilherme', 'Luiz Guilherme D. Pinheiro',
       '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid, 'Consultor'
FROM auth.users u
WHERE u.email IN ('lgdiazpinheiro@gmail.com','lgdiazpinheiro@hotmail.com')
ON CONFLICT (id) DO UPDATE
SET tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid,
    role_label = 'Consultor',
    display_name = COALESCE(public.profiles.display_name, 'Luiz Guilherme');

-- 3) Ensure tenant_memberships for both accounts
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
SELECT '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid, u.id, 'consultant'::tenant_role, 'Luiz Guilherme'
FROM auth.users u
WHERE u.email IN ('lgdiazpinheiro@gmail.com','lgdiazpinheiro@hotmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = u.id AND tm.tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid
  );

-- 4) Ensure app role
INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT u.id, 'consultant'::app_role, '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid
FROM auth.users u
WHERE u.email IN ('lgdiazpinheiro@gmail.com','lgdiazpinheiro@hotmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'consultant'::app_role
  );

-- 5) Ensure a single active tenant_member linked to the gmail account
UPDATE public.tenant_members
SET user_id = '25561017-65f0-4e18-8426-cea22b42328f'::uuid,
    is_active = true,
    role_label = 'Consultor',
    email = 'lgdiazpinheiro@gmail.com',
    updated_at = now()
WHERE tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid
  AND (lower(display_name) LIKE '%luiz%' OR lower(username) LIKE '%luiz%' OR lower(coalesce(email,'')) LIKE '%lgdiazpinheiro%');

INSERT INTO public.tenant_members (tenant_id, username, password_hash, display_name, full_name, role_label, avatar_color, is_active, user_id, email)
SELECT '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid, 'luiz', crypt('Feracon@2026', gen_salt('bf')),
       'Luiz Guilherme', 'Luiz Guilherme D. Pinheiro', 'Consultor', '#2563eb', true,
       '25561017-65f0-4e18-8426-cea22b42328f'::uuid, 'lgdiazpinheiro@gmail.com'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid
    AND m.user_id = '25561017-65f0-4e18-8426-cea22b42328f'::uuid
);