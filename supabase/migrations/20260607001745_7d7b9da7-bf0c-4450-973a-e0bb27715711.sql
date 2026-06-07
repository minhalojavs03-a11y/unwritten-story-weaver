
DROP INDEX IF EXISTS public.whatsapp_instances_tenant_seller_uniq;
DROP INDEX IF EXISTS public.whatsapp_instances_tenant_seller_unique;
-- Mantém unicidade só por (tenant, seller, phone) para evitar duplicar o MESMO número.
CREATE UNIQUE INDEX whatsapp_instances_tenant_seller_phone_uniq
  ON public.whatsapp_instances (tenant_id, seller_user_id, phone_number)
  WHERE seller_user_id IS NOT NULL AND phone_number IS NOT NULL;
