-- Restaura a marcação de "simulação enviada" revertida em 28/07 (17:40 e 19:18)
UPDATE public.leads
SET stage = 'agendado',
    lead_phase = 'simulacao',
    notes = NULLIF(
      regexp_replace(
        regexp_replace(notes, '\n?\[[0-9/: ]+\] Ajuste automático: simulação desmarcada[^\n]*', '', 'g'),
        '\n?\[[0-9/: ]+\] Ajuste: detecção de simulação por texto desativada[^\n]*', '', 'g'
      ), '')
WHERE tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'
  AND stage IN ('atendimento', 'qualificado')
  AND (notes ILIKE '%simulação desmarcada%' OR notes ILIKE '%detecção de simulação por texto%');

UPDATE public.leads
SET notes = NULLIF(
      regexp_replace(
        regexp_replace(notes, '\n?\[[0-9/: ]+\] Ajuste automático: simulação desmarcada[^\n]*', '', 'g'),
        '\n?\[[0-9/: ]+\] Ajuste: detecção de simulação por texto desativada[^\n]*', '', 'g'
      ), '')
WHERE tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'
  AND (notes ILIKE '%simulação desmarcada%' OR notes ILIKE '%detecção de simulação por texto%');