
-- ============================================================
-- MIGRATION 2: Operational tables (multi-tenant)
-- ============================================================

-- Helper: shorthand check for staff (owner or attendant) in current tenant
CREATE OR REPLACE FUNCTION public.is_tenant_staff(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT _tenant_id IS NOT NULL
    AND _tenant_id = private.current_tenant_id()
    AND (
      private.has_role(auth.uid(), 'owner'::app_role)
      OR private.has_role(auth.uid(), 'attendant'::app_role)
    )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT _tenant_id IS NOT NULL
    AND _tenant_id = private.current_tenant_id()
    AND private.has_role(auth.uid(), 'owner'::app_role)
$$;

-- ============================================================
-- whatsapp_instances
-- ============================================================
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  token text,
  instance_id text,
  qr_code text,
  phone_number text,
  webhook_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_instances_tenant ON public.whatsapp_instances(tenant_id);
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all whatsapp_instances" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view whatsapp_instances in tenant" ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage whatsapp_instances" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_whatsapp_instances_updated
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- leads
-- ============================================================
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  source text,
  status text NOT NULL DEFAULT 'new',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  score integer NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_tenant ON public.leads(tenant_id);
CREATE INDEX idx_leads_phone ON public.leads(tenant_id, phone);
CREATE INDEX idx_leads_status ON public.leads(tenant_id, status);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all leads" ON public.leads
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view leads in tenant" ON public.leads
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff create leads in tenant" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff update leads in tenant" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_tenant_staff(tenant_id))
  WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners delete leads" ON public.leads
  FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_tenant ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON public.conversations(lead_id);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all conversations" ON public.conversations
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.is_tenant_staff(tenant_id))
  WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners delete conversations" ON public.conversations
  FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  status text NOT NULL DEFAULT 'sent',
  external_id text,
  sent_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_tenant ON public.messages(tenant_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all messages" ON public.messages
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff create messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff update messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_tenant_staff(tenant_id))
  WITH CHECK (public.is_tenant_staff(tenant_id));

-- ============================================================
-- appointments
-- ============================================================
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'scheduled',
  service text,
  notes text,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_tenant ON public.appointments(tenant_id, scheduled_at);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all appointments" ON public.appointments
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view appointments" ON public.appointments
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff create appointments" ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Staff update appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.is_tenant_staff(tenant_id))
  WITH CHECK (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners delete appointments" ON public.appointments
  FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- products
-- ============================================================
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'BRL',
  category text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all products" ON public.products
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view products" ON public.products
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- templates
-- ============================================================
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_tenant ON public.templates(tenant_id);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all templates" ON public.templates
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view templates" ON public.templates
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage templates" ON public.templates
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- automations
-- ============================================================
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automations_tenant ON public.automations(tenant_id);
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all automations" ON public.automations
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view automations" ON public.automations
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage automations" ON public.automations
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_automations_updated BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- campaigns
-- ============================================================
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_tenant ON public.campaigns(tenant_id);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all campaigns" ON public.campaigns
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Staff view campaigns" ON public.campaigns
  FOR SELECT TO authenticated USING (public.is_tenant_staff(tenant_id));
CREATE POLICY "Owners manage campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
