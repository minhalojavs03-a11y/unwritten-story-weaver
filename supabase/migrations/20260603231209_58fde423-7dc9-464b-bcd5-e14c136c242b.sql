
-- Limpar tenant próprio de Renata Sobral para permitir aceitar convite Feracon
-- User: a452f69e-c5bb-4012-ae5f-b16eddb05051 (renatasobral.ms@gmail.com)
-- Tenant a remover: b534dc04-c39c-4373-864f-c6b75c5a4529 (Renata)

-- 1) Remover membership própria
DELETE FROM public.tenant_memberships
 WHERE user_id = 'a452f69e-c5bb-4012-ae5f-b16eddb05051'
   AND tenant_id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';

-- 2) Limpar dados do tenant antigo (leads e dependências)
DELETE FROM public.leads WHERE tenant_id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';
DELETE FROM public.tenant_members WHERE tenant_id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';
DELETE FROM public.tenant_role_invites WHERE tenant_id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';
DELETE FROM public.ai_config WHERE tenant_id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';

-- 3) Remover o tenant
DELETE FROM public.tenants WHERE id = 'b534dc04-c39c-4373-864f-c6b75c5a4529';

-- 4) Zerar tenant_id do profile para liberar accept_role_invite
UPDATE public.profiles
   SET tenant_id = NULL, updated_at = now()
 WHERE id = 'a452f69e-c5bb-4012-ae5f-b16eddb05051';
