
-- Consolidate duplicated conversations (one per tenant_id+lead_id)
WITH ranked AS (
  SELECT id, tenant_id, lead_id,
    FIRST_VALUE(id) OVER (PARTITION BY tenant_id, lead_id ORDER BY created_at ASC, id ASC) AS keeper_id
  FROM public.conversations
  WHERE lead_id IS NOT NULL
),
moves AS (
  SELECT id AS dup_id, keeper_id FROM ranked WHERE id <> keeper_id
)
UPDATE public.messages m
SET conversation_id = moves.keeper_id
FROM moves
WHERE m.conversation_id = moves.dup_id;

-- Refresh keeper aggregates (last_message_at / preview / unread)
WITH agg AS (
  SELECT conversation_id,
         MAX(created_at) AS last_at,
         (ARRAY_AGG(body ORDER BY created_at DESC))[1] AS last_body
  FROM public.messages
  GROUP BY conversation_id
)
UPDATE public.conversations c
SET last_message_at = COALESCE(agg.last_at, c.last_message_at),
    last_message_preview = COALESCE(LEFT(agg.last_body, 120), c.last_message_preview)
FROM agg
WHERE agg.conversation_id = c.id;

-- Delete duplicate (now empty) conversations, keeping the oldest per (tenant_id, lead_id)
WITH ranked AS (
  SELECT id, tenant_id, lead_id,
    FIRST_VALUE(id) OVER (PARTITION BY tenant_id, lead_id ORDER BY created_at ASC, id ASC) AS keeper_id
  FROM public.conversations
  WHERE lead_id IS NOT NULL
)
DELETE FROM public.conversations c
USING ranked
WHERE c.id = ranked.id AND ranked.id <> ranked.keeper_id;

-- Prevent future duplicates (partial unique: ignore raw conversations with lead_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_tenant_lead_unique
  ON public.conversations (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;
