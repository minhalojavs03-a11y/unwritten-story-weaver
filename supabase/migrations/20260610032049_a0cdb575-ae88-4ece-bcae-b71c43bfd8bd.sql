
CREATE OR REPLACE FUNCTION public.enforce_message_lead_matches_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_conv_lead uuid;
  v_conv_tenant uuid;
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lead_id, tenant_id INTO v_conv_lead, v_conv_tenant
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message: conversation_id % does not exist', NEW.conversation_id;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_conv_tenant THEN
    RAISE EXCEPTION 'message tenant_id (%) does not match conversation tenant_id (%)', NEW.tenant_id, v_conv_tenant;
  END IF;

  -- Se a conversa tem lead, a mensagem DEVE ter o mesmo lead.
  IF v_conv_lead IS NOT NULL AND NEW.lead_id IS DISTINCT FROM v_conv_lead THEN
    RAISE EXCEPTION 'message lead_id (%) does not match conversation lead_id (%) — cross-contamination blocked', NEW.lead_id, v_conv_lead;
  END IF;

  -- Se a conversa NÃO tem lead (raw-only do superadmin), a mensagem também não pode ter lead.
  IF v_conv_lead IS NULL AND NEW.lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'message has lead_id (%) but conversation % has no lead — attach to a proper conversation instead', NEW.lead_id, NEW.conversation_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_message_lead_match ON public.messages;
CREATE TRIGGER enforce_message_lead_match
  BEFORE INSERT OR UPDATE OF conversation_id, lead_id, tenant_id ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_lead_matches_conversation();
