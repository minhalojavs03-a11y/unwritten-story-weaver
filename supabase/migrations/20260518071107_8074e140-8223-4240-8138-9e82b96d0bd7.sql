ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS server_url text,
  ADD COLUMN IF NOT EXISTS instance_token text,
  ADD COLUMN IF NOT EXISTS is_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_connection_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT 'Bot',
  ADD COLUMN IF NOT EXISTS webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS seller_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS phone_label text,
  ADD COLUMN IF NOT EXISTS connected_agents_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS whatsapp_instances_connection_idx
  ON public.whatsapp_instances (tenant_id, is_connected, status);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_whatsapp_instance_idx
  ON public.messages (tenant_id, whatsapp_instance_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_silence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  phone text NOT NULL,
  silenced_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_silence_tenant_phone_idx
  ON public.whatsapp_silence (tenant_id, phone, silenced_until);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_silence_unique_scope
  ON public.whatsapp_silence (tenant_id, COALESCE(whatsapp_instance_id, '00000000-0000-0000-0000-000000000000'::uuid), phone);

ALTER TABLE public.whatsapp_silence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view whatsapp_silence" ON public.whatsapp_silence;
CREATE POLICY "Staff view whatsapp_silence"
  ON public.whatsapp_silence FOR SELECT TO authenticated
  USING (public.is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS "Owners manage whatsapp_silence" ON public.whatsapp_silence;
CREATE POLICY "Owners manage whatsapp_silence"
  ON public.whatsapp_silence FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

DROP POLICY IF EXISTS "Superadmins manage all whatsapp_silence" ON public.whatsapp_silence;
CREATE POLICY "Superadmins manage all whatsapp_silence"
  ON public.whatsapp_silence FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));