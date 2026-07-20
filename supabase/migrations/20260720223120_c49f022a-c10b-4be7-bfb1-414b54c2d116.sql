
CREATE OR REPLACE FUNCTION public.notify_lead_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Só dispara quando o consultor responsável MUDA para outro consultor real.
  -- Ignora quando: nulo→algo (é atribuição inicial, tratada por notify-consultant-by-tier),
  -- algo→nulo (release), ou mesmo consultor.
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.assigned_member_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.assigned_member_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.assigned_member_id = OLD.assigned_member_id THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/notify-consultant-transfer',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'lead_id', NEW.id,
      'from_member_id', OLD.assigned_member_id,
      'to_member_id', NEW.assigned_member_id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_lead_transfer ON public.leads;
CREATE TRIGGER trg_notify_lead_transfer
AFTER UPDATE OF assigned_member_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_lead_transfer();
