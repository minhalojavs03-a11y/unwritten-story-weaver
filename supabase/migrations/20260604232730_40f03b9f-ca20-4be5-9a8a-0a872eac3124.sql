CREATE OR REPLACE FUNCTION public.notify_consultant_by_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.credit_value IS NOT DISTINCT FROM NEW.credit_value THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://qwoilgpbxxzjzpltosas.supabase.co/functions/v1/notify-consultant-by-tier',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('lead_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_consultant_by_tier ON public.leads;
CREATE TRIGGER trg_notify_consultant_by_tier
AFTER INSERT OR UPDATE OF credit_value ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_consultant_by_tier();