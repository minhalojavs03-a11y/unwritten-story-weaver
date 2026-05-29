-- 1) whatsapp_instances: permitir múltiplas por tenant, com nome único dentro do tenant
DROP INDEX IF EXISTS whatsapp_instances_tenant_id_key;
ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_tenant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_tenant_name_uniq
  ON public.whatsapp_instances (tenant_id, lower(instance_name));

CREATE INDEX IF NOT EXISTS whatsapp_instances_tenant_idx
  ON public.whatsapp_instances (tenant_id);

-- 2) conversations: vincular à instância de origem
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;

CREATE INDEX IF NOT EXISTS conversations_instance_idx
  ON public.conversations (whatsapp_instance_id);

-- 3) messages: vincular à instância de origem
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;

CREATE INDEX IF NOT EXISTS messages_instance_idx
  ON public.messages (whatsapp_instance_id);

-- 4) whatsapp_silence: silêncio passa a ser por instância
ALTER TABLE public.whatsapp_silence
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;

-- Remove qualquer PK/UK antiga (phone+tenant) para recriar incluindo a instância
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_silence'::regclass
      AND contype IN ('p','u')
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_silence DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_silence_uniq
  ON public.whatsapp_silence (tenant_id, COALESCE(whatsapp_instance_id, '00000000-0000-0000-0000-000000000000'::uuid), phone);