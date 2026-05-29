-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.lead_temperature AS ENUM ('hot', 'warm', 'cold');
CREATE TYPE public.lead_stage AS ENUM ('novo', 'qualificado', 'agendado', 'compareceu', 'comprou', 'perdido');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE public.appointment_status AS ENUM ('agendado', 'confirmado', 'compareceu', 'faltou', 'cancelado');
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'closed');
CREATE TYPE public.whatsapp_status AS ENUM ('disconnected', 'connecting', 'connected', 'error');
CREATE TYPE public.automation_trigger AS ENUM ('lead_created', 'no_response', 'appointment_scheduled', 'appointment_reminder', 'post_visit', 'inactivity');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'cancelled');

-- =========================================
-- WHATSAPP INSTANCES
-- =========================================
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  status whatsapp_status NOT NULL DEFAULT 'disconnected',
  qr_code TEXT,
  last_connected_at TIMESTAMPTZ,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_instances_tenant ON public.whatsapp_instances(tenant_id);

-- =========================================
-- LEADS
-- =========================================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  temperature lead_temperature NOT NULL DEFAULT 'warm',
  stage lead_stage NOT NULL DEFAULT 'novo',
  source TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  assigned_to UUID,
  last_message_at TIMESTAMPTZ,
  last_interaction_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX idx_leads_tenant ON public.leads(tenant_id);
CREATE INDEX idx_leads_stage ON public.leads(tenant_id, stage);
CREATE INDEX idx_leads_temperature ON public.leads(tenant_id, temperature);

-- =========================================
-- CONVERSATIONS
-- =========================================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status conversation_status NOT NULL DEFAULT 'open',
  unread_count INT NOT NULL DEFAULT 0,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_tenant ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON public.conversations(lead_id);

-- =========================================
-- MESSAGES
-- =========================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  body TEXT,
  media_url TEXT,
  media_type TEXT,
  status message_status NOT NULL DEFAULT 'sent',
  sent_by UUID,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_tenant ON public.messages(tenant_id);

-- =========================================
-- APPOINTMENTS
-- =========================================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  type TEXT NOT NULL DEFAULT 'consulta',
  status appointment_status NOT NULL DEFAULT 'agendado',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_tenant_date ON public.appointments(tenant_id, scheduled_at);

-- =========================================
-- PRODUCTS
-- =========================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  price NUMERIC(10,2),
  stock INT DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);

-- =========================================
-- TEMPLATES
-- =========================================
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_tenant ON public.templates(tenant_id);

-- =========================================
-- AUTOMATIONS
-- =========================================
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger automation_trigger NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automations_tenant ON public.automations(tenant_id);

-- =========================================
-- CAMPAIGNS
-- =========================================
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_body TEXT NOT NULL,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  status campaign_status NOT NULL DEFAULT 'draft',
  total_recipients INT DEFAULT 0,
  total_sent INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_tenant ON public.campaigns(tenant_id);

-- =========================================
-- AI CONFIG
-- =========================================
CREATE TABLE public.ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tone TEXT NOT NULL DEFAULT 'amigavel',
  system_prompt TEXT NOT NULL DEFAULT 'Você é um atendente de uma ótica brasileira. Seja cordial, breve e ajude a agendar consultas.',
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- BILLING EVENTS
-- =========================================
CREATE TABLE public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  mrr NUMERIC(10,2) NOT NULL DEFAULT 0,
  messages_sent INT NOT NULL DEFAULT 0,
  leads_created INT NOT NULL DEFAULT 0,
  appointments_created INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_month)
);
CREATE INDEX idx_billing_tenant ON public.billing_events(tenant_id);

-- =========================================
-- TRIGGERS para updated_at
-- =========================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['whatsapp_instances','leads','conversations','appointments','products','templates','automations','campaigns','ai_config'])
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- =========================================
-- ENABLE RLS
-- =========================================
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- =========================================
-- RLS POLICIES — padrão: tenant members SELECT, owners ALL, superadmin ALL
-- =========================================

-- helper macro via repeated statements
-- whatsapp_instances
CREATE POLICY "tenant select" ON public.whatsapp_instances FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage" ON public.whatsapp_instances FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));
CREATE POLICY "superadmin all" ON public.whatsapp_instances FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- leads (atendentes podem inserir/atualizar)
CREATE POLICY "tenant select" ON public.leads FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant update" ON public.leads FOR UPDATE TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "owner delete" ON public.leads FOR DELETE TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));
CREATE POLICY "superadmin all" ON public.leads FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- conversations
CREATE POLICY "tenant select" ON public.conversations FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant update" ON public.conversations FOR UPDATE TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "owner delete" ON public.conversations FOR DELETE TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- messages (não permite update/delete pra preservar histórico)
CREATE POLICY "tenant select" ON public.messages FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());

-- appointments
CREATE POLICY "tenant select" ON public.appointments FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "tenant insert" ON public.appointments FOR INSERT TO authenticated WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant update" ON public.appointments FOR UPDATE TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "owner delete" ON public.appointments FOR DELETE TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- products
CREATE POLICY "tenant select" ON public.products FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage" ON public.products FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- templates (globais visíveis a todos autenticados)
CREATE POLICY "select global or tenant" ON public.templates FOR SELECT TO authenticated USING (is_global OR tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage tenant templates" ON public.templates FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));
CREATE POLICY "superadmin manage globals" ON public.templates FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- automations
CREATE POLICY "tenant select" ON public.automations FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage" ON public.automations FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- campaigns
CREATE POLICY "tenant select" ON public.campaigns FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage" ON public.campaigns FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- ai_config
CREATE POLICY "tenant select" ON public.ai_config FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "owner manage" ON public.ai_config FOR ALL TO authenticated USING (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner')) WITH CHECK (tenant_id = current_tenant_id() AND has_role(auth.uid(),'owner'));

-- billing_events
CREATE POLICY "tenant select" ON public.billing_events FOR SELECT TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin(auth.uid()));
CREATE POLICY "superadmin manage" ON public.billing_events FOR ALL TO authenticated USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- Profiles: permitir INSERT para superadmins/owners (futuro convite)
CREATE POLICY "Superadmins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (is_superadmin(auth.uid()));

-- =========================================
-- AUTH SETUP FUNCTIONS
-- =========================================

-- Primeiro usuário do sistema vira superadmin (se ninguém ainda for)
CREATE OR REPLACE FUNCTION public.bootstrap_first_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_super BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'superadmin') INTO has_super;
  IF has_super THEN RETURN FALSE; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'superadmin')
  ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

-- Owner cria seu próprio tenant (se ainda não tiver)
CREATE OR REPLACE FUNCTION public.create_my_tenant(_name TEXT, _slug TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  existing_tenant UUID;
  final_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT tenant_id INTO existing_tenant FROM public.profiles WHERE id = auth.uid();
  IF existing_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'user already belongs to a tenant';
  END IF;

  final_slug := COALESCE(NULLIF(_slug,''), lower(regexp_replace(_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 6));

  INSERT INTO public.tenants (name, slug) VALUES (_name, final_slug) RETURNING id INTO new_tenant_id;
  UPDATE public.profiles SET tenant_id = new_tenant_id WHERE id = auth.uid();
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (auth.uid(), 'owner', new_tenant_id);
  INSERT INTO public.ai_config (tenant_id) VALUES (new_tenant_id);
  RETURN new_tenant_id;
END;
$$;

-- Garante o trigger handle_new_user em auth.users (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime para conversas/mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;