ALTER TABLE public.tenant_members
ADD COLUMN IF NOT EXISTS receive_leads_when_offline boolean NOT NULL DEFAULT false;

-- Renata já opera nesse modo hoje via exceção hardcoded — migra o estado atual.
UPDATE public.tenant_members
SET receive_leads_when_offline = true
WHERE user_id = 'a452f69e-c5bb-4012-ae5f-b16eddb05051';