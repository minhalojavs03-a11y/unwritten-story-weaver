
-- Backfill: marca leads importados do histórico
UPDATE public.leads
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('imported_from_history', true)
WHERE stage = 'historico'
  AND COALESCE((metadata->>'imported_from_history')::boolean, false) = false;

-- Backfill: marca conversas correspondentes
UPDATE public.conversations c
SET metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object('imported_from_history', true)
FROM public.leads l
WHERE c.lead_id = l.id
  AND COALESCE((l.metadata->>'imported_from_history')::boolean, false) = true
  AND COALESCE((c.metadata->>'imported_from_history')::boolean, false) = false;
