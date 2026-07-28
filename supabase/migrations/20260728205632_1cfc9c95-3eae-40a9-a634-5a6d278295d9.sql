CREATE OR REPLACE FUNCTION public.detect_simulation_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txt text;
BEGIN
  IF NEW.direction <> 'outbound' OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_txt := lower(coalesce(NEW.content,'') || ' ' || coalesce(NEW.body,''));

  IF v_txt ~ '(4\s*[ªa°º]?\s*op[çc][ãa]o|quarta\s+op[çc][ãa]o)' THEN
    UPDATE public.leads l
    SET lead_phase = 'simulacao',
        stage = CASE WHEN l.stage IN ('novo','qualificado','atendimento') THEN 'agendado' ELSE l.stage END,
        notes = coalesce(l.notes,'') || CASE WHEN coalesce(l.notes,'') = '' THEN '' ELSE E'\n' END
                || '[' || to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') || '] Simulação enviada (detectada por mensagem da 4ª opção)',
        updated_at = now()
    WHERE l.id = NEW.lead_id
      AND coalesce(l.lead_phase,'') <> 'simulacao';
  END IF;

  RETURN NEW;
END;
$$;