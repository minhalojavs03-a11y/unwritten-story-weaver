INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
VALUES ('9ecb99e2-50ee-404f-920b-81cd94cc685e', 'f11308dd-8bf0-4a17-a7d8-840d2850db30', 'consultor', 'Fábio Rogério de Quadros')
ON CONFLICT DO NOTHING;