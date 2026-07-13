UPDATE public.tenant_members
SET role_label = 'Consultor', updated_at = now()
WHERE lower(coalesce(role_label,'')) = 'consultant';