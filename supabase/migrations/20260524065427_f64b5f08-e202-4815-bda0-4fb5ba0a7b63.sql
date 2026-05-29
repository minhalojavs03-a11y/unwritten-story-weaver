ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS created_by_member_id uuid;
CREATE INDEX IF NOT EXISTS idx_templates_created_by_member ON public.templates(tenant_id, created_by_member_id);