CREATE OR REPLACE FUNCTION public.detect_simulation_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_text text;
BEGIN
  v_text := coalesce(NEW.content, NEW.body, '');

  IF NEW.direction = 'outbound'
     AND NEW.lead_id IS NOT NULL
     AND (
       v_text ILIKE '%qual opção mais se aproxima do valor que você está buscando%'
       OR v_text ILIKE '%qual opcao mais se aproxima do valor que voce esta buscando%'
       OR v_text ILIKE '%an_lise de rating%'
       OR v_text ILIKE '%cr_dito de cancelamento%'
     )
  THEN
    UPDATE public.leads l
       SET lead_phase = 'simulacao',
           stage = CASE WHEN l.status <> 'lost' AND l.stage IN ('novo','qualificado','em_atendimento')
                        THEN 'agendado' ELSE l.stage END,
           updated_at = now()
     WHERE l.id = NEW.lead_id
       AND (l.lead_phase IS DISTINCT FROM 'simulacao' OR l.stage IN ('novo','qualificado','em_atendimento'));
  END IF;
  RETURN NEW;
END;
$function$;