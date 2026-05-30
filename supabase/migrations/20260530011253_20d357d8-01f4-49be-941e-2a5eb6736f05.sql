UPDATE public.tenants SET slug = 'feracon' WHERE slug IS NULL AND lower(name) = 'feracon';
-- Garantir slug não nulo no futuro
ALTER TABLE public.tenants ALTER COLUMN slug SET DEFAULT lower(regexp_replace(gen_random_uuid()::text, '-', '', 'g'));