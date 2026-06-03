-- Cria a tenant_membership faltante para Vinicius Macedo no próprio tenant dele
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
VALUES ('2ffb7ce3-11d7-4142-85e7-860fe087436f', 'e6d08b78-f19b-4084-84a0-f2972718c9a4', 'owner', 'Vinicius Macedo')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

-- Garante created_by do tenant
UPDATE public.tenants
SET created_by = 'e6d08b78-f19b-4084-84a0-f2972718c9a4'
WHERE id = '2ffb7ce3-11d7-4142-85e7-860fe087436f' AND created_by IS NULL;