-- Corrige o papel do Nilton na própria loja dele (estava como consultant, deveria ser owner)
UPDATE public.tenant_memberships
SET role = 'owner'
WHERE user_id = '88d35577-6f4b-4d34-b29e-b5cfdd09580c'
  AND tenant_id = '92c02689-0764-48d1-8ecb-428446b11ed1';

-- Remove instâncias órfãs "Principal" criadas em loop (nunca conectaram, seller_user_id NULL)
DELETE FROM public.whatsapp_instances
WHERE tenant_id = '92c02689-0764-48d1-8ecb-428446b11ed1'
  AND is_connected = false
  AND seller_user_id IS NULL;