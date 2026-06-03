-- 1) Adicionar coluna de distribuição de tenants ao sheet_sync_config
ALTER TABLE public.sheet_sync_config
  ADD COLUMN IF NOT EXISTS distribution_tenant_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- 2) Corrigir tenant_memberships de Micaelly e Jean (eram NULL — RLS estava bloqueando tudo)
INSERT INTO public.tenant_memberships (user_id, tenant_id, role)
VALUES
  ('39e2f46f-3990-4cbf-89f9-9a49499c92f3','3fb4f114-0fc5-4f70-8582-94386a2f7e6c','owner'),
  ('d8f37b31-c8ce-4a41-bac8-05568041cf80','72b48c52-293c-4eb5-a4a0-2e6f675182ce','owner')
ON CONFLICT DO NOTHING;

-- 3) Configurar a planilha Feracon para distribuir round-robin entre Micaelly e Jean
UPDATE public.sheet_sync_config
SET distribution_tenant_ids = ARRAY[
  '3fb4f114-0fc5-4f70-8582-94386a2f7e6c'::uuid,  -- Micaelly
  '72b48c52-293c-4eb5-a4a0-2e6f675182ce'::uuid   -- Jean
]
WHERE id = 'fca94aa7-9250-45fc-943d-36deef9a8960';