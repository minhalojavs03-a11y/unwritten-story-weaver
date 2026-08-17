DO $$
DECLARE
    v_user_id uuid := '25561017-65f0-4e18-8426-cea22b42328f';
    v_tenant_id uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e';
BEGIN
    -- 1. Garante o profile com o tenant correto
    UPDATE public.profiles 
    SET tenant_id = v_tenant_id, 
        display_name = COALESCE(display_name, 'Luiz Guilherme D. Pinheiro'),
        role_label = 'Consultor',
        updated_at = now()
    WHERE id = v_user_id;

    -- 2. Garante o tenant_member
    -- A senha interna não é utilizada para login Supabase, mas o campo é NOT NULL.
    -- O MemberLoginDialog usa RPC verify_tenant_member.
    INSERT INTO public.tenant_members (tenant_id, user_id, username, password_hash, display_name, role_label, is_active)
    VALUES (v_tenant_id, v_user_id, 'lgdiazpinheiro@gmail.com', 'DISABLED', 'Luiz Guilherme D. Pinheiro', 'Consultor', true)
    ON CONFLICT (tenant_id, username) DO UPDATE 
    SET user_id = EXCLUDED.user_id, is_active = true;

    -- 3. Garante o tenant_membership
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
    VALUES (v_tenant_id, v_user_id, 'consultant', 'Luiz Guilherme D. Pinheiro')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- 4. Garante a user_role
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (v_user_id, 'consultant', v_tenant_id)
    ON CONFLICT (user_id, role) DO UPDATE 
    SET tenant_id = EXCLUDED.tenant_id;

END $$;