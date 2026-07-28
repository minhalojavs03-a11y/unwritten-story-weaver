DROP TRIGGER IF EXISTS trg_detect_simulation_sent ON public.messages;
DROP FUNCTION IF EXISTS public.detect_simulation_sent();

UPDATE public.leads
   SET stage = 'atendimento',
       lead_phase = NULL,
       notes = coalesce(notes,'') || E'\n[' || to_char(now() - interval '3 hours','DD/MM/YYYY HH24:MI') || '] Ajuste: detecção de simulação por texto desativada — etapa revertida.',
       updated_at = now()
 WHERE notes ILIKE '%detectada%'
   AND stage = 'agendado';