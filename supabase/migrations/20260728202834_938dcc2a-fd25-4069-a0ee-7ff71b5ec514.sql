CREATE OR REPLACE FUNCTION public.detect_simulation_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'outbound'
     AND NEW.lead_id IS NOT NULL
     AND coalesce(NEW.content, NEW.body, '') ILIKE '%qual opção mais se aproxima do valor que você está buscando%'
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
$$;

DROP TRIGGER IF EXISTS trg_detect_simulation_sent ON public.messages;
CREATE TRIGGER trg_detect_simulation_sent
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.detect_simulation_sent();