-- Backfill temperature/stage for existing WhatsApp leads using their conversation preview
WITH src AS (
  SELECT l.id, lower(coalesce(c.last_message_preview, '')) AS prev
  FROM public.leads l
  LEFT JOIN public.conversations c ON c.lead_id = l.id
  WHERE l.source = 'WhatsApp' AND l.stage = 'novo'
)
UPDATE public.leads l
SET
  temperature = CASE
    WHEN s.prev ~ '(agendar|marcar|hoje|agora|urgent|urge|quebr|perdi|preciso|disponível|disponivel|que horas|amanhã|amanha|encaixe|encaix)' THEN 'hot'::lead_temperature
    WHEN s.prev ~ '(preço|preco|valor|quanto|orçamento|orcamento|convênio|convenio|plano|aceita|tem|disponíveis|grau|lente|armação|armacao|óculos|oculos|consulta|exame)' THEN 'warm'::lead_temperature
    WHEN length(trim(s.prev)) = 0 THEN l.temperature
    ELSE 'cold'::lead_temperature
  END,
  stage = CASE
    WHEN s.prev ~ '(agendar|marcar|hoje|agora|urgent|urge|quebr|perdi|preciso|disponível|disponivel|que horas|amanhã|amanha|encaixe|encaix|preço|preco|valor|quanto|orçamento|orcamento|convênio|convenio|plano)' THEN 'qualificado'::lead_stage
    ELSE l.stage
  END
FROM src s
WHERE l.id = s.id;