
-- 1) Para cada lead com múltiplas conversas, escolher uma "keeper" (a mais recente por last_message_at, fallback created_at)
WITH ranked AS (
  SELECT id, lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY COALESCE(last_message_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM public.conversations
  WHERE lead_id IS NOT NULL
),
keepers AS (
  SELECT lead_id, id AS keeper_id FROM ranked WHERE rn = 1
),
dups AS (
  SELECT r.id AS dup_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON k.lead_id = r.lead_id
  WHERE r.rn > 1
)
-- Reaponta mensagens das conversas duplicadas para a keeper
UPDATE public.messages m
SET conversation_id = d.keeper_id
FROM dups d
WHERE m.conversation_id = d.dup_id;

-- Atualiza preview/last_message_at da keeper com base na última mensagem real
UPDATE public.conversations c
SET last_message_at = sub.max_at,
    last_message_preview = sub.body
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, created_at AS max_at, body
  FROM public.messages
  ORDER BY conversation_id, created_at DESC
) sub
WHERE sub.conversation_id = c.id;

-- Remove conversas duplicadas (sem mensagens)
WITH ranked AS (
  SELECT id, lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY COALESCE(last_message_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM public.conversations
  WHERE lead_id IS NOT NULL
)
DELETE FROM public.conversations c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 2) Cria índice único para impedir novas duplicatas por lead
CREATE UNIQUE INDEX IF NOT EXISTS conversations_lead_id_unique
  ON public.conversations(lead_id)
  WHERE lead_id IS NOT NULL;
