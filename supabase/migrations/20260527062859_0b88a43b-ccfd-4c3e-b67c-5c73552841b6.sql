
CREATE TABLE public.coaching_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  lead_id uuid,
  member_id uuid,
  message_id uuid,
  insight_type text NOT NULL CHECK (insight_type IN ('missed_buying_signal','should_be_audio','low_assertiveness','objection_unhandled')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  title text NOT NULL,
  detail text,
  signal_quote text,
  consultant_quote text,
  suggestion text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coaching_tenant_created ON public.coaching_insights(tenant_id, created_at DESC);
CREATE INDEX idx_coaching_member ON public.coaching_insights(tenant_id, member_id, created_at DESC);
CREATE INDEX idx_coaching_lead ON public.coaching_insights(lead_id);
CREATE INDEX idx_coaching_conv ON public.coaching_insights(conversation_id);
CREATE INDEX idx_coaching_type_sev ON public.coaching_insights(tenant_id, insight_type, severity);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_insights TO authenticated;
GRANT ALL ON public.coaching_insights TO service_role;

ALTER TABLE public.coaching_insights ENABLE ROW LEVEL SECURITY;

-- Owners/superadmins veem tudo da loja
CREATE POLICY "owners_supervisors_view_all_coaching"
ON public.coaching_insights FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
);

-- Consultores veem os próprios insights
CREATE POLICY "members_view_own_coaching"
ON public.coaching_insights FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Marcar como resolvido (owner/supervisor/superadmin ou o próprio consultor)
CREATE POLICY "update_coaching_resolve"
ON public.coaching_insights FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
);

-- Trigger: ao inserir mensagem outbound de humano, dispara análise async
CREATE OR REPLACE FUNCTION public.trigger_coaching_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só analisa outbound de humano (sent_by não nulo)
  IF NEW.direction <> 'outbound' OR NEW.sent_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Dispara em background; ignora falhas
  BEGIN
    PERFORM net.http_post(
      url := 'https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/analyze-coaching',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER coaching_analyze_on_outbound
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_coaching_analysis();
