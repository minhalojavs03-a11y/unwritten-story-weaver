INSERT INTO public.tenant_members (tenant_id, username, display_name, role_label, is_active, password_hash)
VALUES ('9ecb99e2-50ee-404f-920b-81cd94cc685e', 'lgdiazpinheiro@gmail.com', 'Luiz Guilherme D. Pinheiro', 'Consultor', true, 'temporary_hash_pending_auth')
ON CONFLICT (tenant_id, username) DO UPDATE 
SET is_active = true, role_label = 'Consultor';