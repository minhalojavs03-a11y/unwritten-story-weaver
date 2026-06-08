
-- A) Normalizar tenant_id
UPDATE public.conversations
SET tenant_id = '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid, updated_at = now()
WHERE tenant_id <> '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid;

-- B) Consolidar conversas duplicadas por lead
WITH ranked AS (
  SELECT
    c.id,
    c.lead_id,
    row_number() OVER (
      PARTITION BY c.lead_id
      ORDER BY (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id) DESC,
               c.created_at ASC,
               c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.lead_id IS NOT NULL
    AND c.lead_id IN (
      SELECT lead_id FROM public.conversations
      WHERE lead_id IS NOT NULL
      GROUP BY lead_id HAVING count(*) > 1
    )
),
keepers AS (SELECT lead_id, id AS keeper_id FROM ranked WHERE rn = 1),
losers AS (SELECT r.id AS loser_id, k.keeper_id
           FROM ranked r JOIN keepers k ON k.lead_id = r.lead_id
           WHERE r.rn > 1)
UPDATE public.messages m
SET conversation_id = l.keeper_id
FROM losers l
WHERE m.conversation_id = l.loser_id;

-- Apagar conversas perdedoras (já sem mensagens)
WITH ranked AS (
  SELECT
    c.id, c.lead_id,
    row_number() OVER (
      PARTITION BY c.lead_id
      ORDER BY (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id) DESC,
               c.created_at ASC, c.id ASC
    ) AS rn
  FROM public.conversations c
  WHERE c.lead_id IS NOT NULL
    AND c.lead_id IN (
      SELECT lead_id FROM public.conversations
      WHERE lead_id IS NOT NULL
      GROUP BY lead_id HAVING count(*) > 1
    )
)
DELETE FROM public.conversations c USING ranked r WHERE c.id = r.id AND r.rn > 1;

-- Atualizar contadores/preview das conversas mantidas
UPDATE public.conversations c
SET
  unread_count = COALESCE((
    SELECT count(*) FROM public.messages m
    WHERE m.conversation_id = c.id AND m.direction = 'inbound' AND COALESCE(m.read_at, NULL) IS NULL
  ), 0),
  last_message_at = COALESCE((SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id), c.last_message_at),
  updated_at = now()
WHERE c.lead_id IN (
  SELECT lead_id FROM public.conversations WHERE lead_id IS NOT NULL GROUP BY lead_id
);

-- C) Apagar conversas órfãs (lead inexistente) — mensagens caem via ON DELETE CASCADE
DELETE FROM public.conversations c
WHERE c.lead_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id);
