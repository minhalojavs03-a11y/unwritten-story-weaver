ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.tenant_members.phone IS
  'Telefone (formato internacional, ex: 5547999990000) usado para notificar o consultor via WhatsApp.';

CREATE OR REPLACE FUNCTION public.notify_consultant_by_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.credit_value IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.credit_value IS NOT DISTINCT FROM NEW.credit_value THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://rqaebwzoxuzfrnwdwufn.supabase.co/functions/v1/notify-consultant-by-tier',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('lead_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebrar o insert do lead por causa da notificação
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_consultant_by_tier ON public.leads;
CREATE TRIGGER trg_notify_consultant_by_tier
AFTER INSERT OR UPDATE OF credit_value ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_consultant_by_tier();