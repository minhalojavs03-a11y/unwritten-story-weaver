INSERT INTO public.tenant_memberships (tenant_id, user_id, role, display_name)
VALUES ('92c02689-0764-48d1-8ecb-428446b11ed1', '88d35577-6f4b-4d34-b29e-b5cfdd09580c', 'consultant', 'Nilton Sartori')
ON CONFLICT (tenant_id, user_id) DO NOTHING;