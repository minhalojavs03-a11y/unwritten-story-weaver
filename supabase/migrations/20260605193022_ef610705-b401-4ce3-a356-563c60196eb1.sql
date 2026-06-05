INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
VALUES ('9ecb99e2-50ee-404f-920b-81cd94cc685e', 'd6054c34-617c-47a6-b25e-b82300483ca7', 'consultant', 'Gizele Trierveiler')
ON CONFLICT (tenant_id, user_id) DO NOTHING;