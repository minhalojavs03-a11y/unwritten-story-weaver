-- Garante 1 instância de WhatsApp por (loja, vendedor).
-- Em corrida, o segundo INSERT falha com 23505 e o ensureProviderInstance
-- já faz rollback da instância órfã criada no provedor (uazapi).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_tenant_seller_unique
  ON public.whatsapp_instances (tenant_id, seller_user_id)
  WHERE seller_user_id IS NOT NULL;