
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS phone_label text,
  ADD COLUMN IF NOT EXISTS connected_agents_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.whatsapp_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  avatar_initials text,
  status text NOT NULL DEFAULT 'pending',
  is_connected boolean NOT NULL DEFAULT false,
  device_index integer,
  last_seen_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_tenant ON public.whatsapp_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_user ON public.whatsapp_agents(user_id);

ALTER TABLE public.whatsapp_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent sees own record"
  ON public.whatsapp_agents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner'::public.app_role)) OR public.is_superadmin(auth.uid()));

CREATE POLICY "agent updates own record"
  ON public.whatsapp_agents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner manages agents"
  ON public.whatsapp_agents FOR ALL
  TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "superadmin manages agents"
  ON public.whatsapp_agents FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER update_whatsapp_agents_updated_at
  BEFORE UPDATE ON public.whatsapp_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
