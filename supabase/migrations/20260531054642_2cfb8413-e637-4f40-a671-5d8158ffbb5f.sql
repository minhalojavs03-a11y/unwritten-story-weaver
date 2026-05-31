-- Garante uma única instância por consultor por tenant
-- Remove possíveis duplicatas antigas mantendo a mais antiga
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, seller_user_id ORDER BY created_at) AS rn
  FROM public.whatsapp_instances
  WHERE seller_user_id IS NOT NULL
)
DELETE FROM public.whatsapp_instances WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_tenant_seller_uniq
  ON public.whatsapp_instances (tenant_id, seller_user_id)
  WHERE seller_user_id IS NOT NULL;