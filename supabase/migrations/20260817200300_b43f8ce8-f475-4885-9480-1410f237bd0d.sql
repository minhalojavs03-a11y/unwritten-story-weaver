GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'lgdiazpinheiro@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
        -- Update tenant_members to link user_id
        UPDATE public.tenant_members 
        SET user_id = v_user_id 
        WHERE username = 'lgdiazpinheiro@gmail.com';
        
        -- Insert user role
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'consultant')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Also ensure profile exists and is linked
        UPDATE public.profiles
        SET tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'
        WHERE id = v_user_id;
    END IF;
END $$;