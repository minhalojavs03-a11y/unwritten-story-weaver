-- Add UAZAPI/provider fields to whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS server_url text,
  ADD COLUMN IF NOT EXISTS instance_token text,
  ADD COLUMN IF NOT EXISTS is_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_connection_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT 'Bot';

-- Silence table for "atendente humano" command (per tenant + phone)
CREATE TABLE IF NOT EXISTS public.whatsapp_silence (
  tenant_id uuid NOT NULL,
  phone text NOT NULL,
  silenced_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, phone)
);

ALTER TABLE public.whatsapp_silence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select silence"
  ON public.whatsapp_silence FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin manage silence"
  ON public.whatsapp_silence FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));