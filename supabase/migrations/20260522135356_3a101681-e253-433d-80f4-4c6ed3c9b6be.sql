-- Clean up existing near-duplicate messages while keeping the best copy
WITH duplicate_candidates AS (
  SELECT m.id
  FROM public.messages m
  WHERE EXISTS (
    SELECT 1
    FROM public.messages k
    WHERE k.id <> m.id
      AND k.tenant_id = m.tenant_id
      AND k.conversation_id IS NOT DISTINCT FROM m.conversation_id
      AND k.direction = m.direction
      AND COALESCE(NULLIF(k.body, ''), NULLIF(k.content, '')) = COALESCE(NULLIF(m.body, ''), NULLIF(m.content, ''))
      AND COALESCE(NULLIF(m.body, ''), NULLIF(m.content, '')) IS NOT NULL
      AND abs(extract(epoch from (k.created_at - m.created_at))) <= 10
      AND (
        (m.external_id IS NULL AND k.external_id IS NOT NULL)
        OR (m.external_id IS NULL AND k.external_id IS NULL AND k.created_at < m.created_at)
        OR (m.external_id IS NOT NULL AND k.external_id IS NOT NULL AND k.created_at < m.created_at)
      )
  )
)
DELETE FROM public.messages m
USING duplicate_candidates d
WHERE m.id = d.id;

-- Remove repeated provider IDs, if any, before enforcing uniqueness
WITH ranked_provider_ids AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, external_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.messages
  WHERE external_id IS NOT NULL AND btrim(external_id) <> ''
)
DELETE FROM public.messages m
USING ranked_provider_ids r
WHERE m.id = r.id AND r.rn > 1;

-- Official WhatsApp/provider IDs must be unique per tenant
CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_external_id_unique
  ON public.messages (tenant_id, external_id)
  WHERE external_id IS NOT NULL AND btrim(external_id) <> '';

CREATE OR REPLACE FUNCTION public.prevent_duplicate_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _existing_id uuid;
  _new_body text;
BEGIN
  _new_body := COALESCE(NULLIF(NEW.body, ''), NULLIF(NEW.content, ''));

  IF NEW.external_id IS NOT NULL THEN
    NEW.external_id := btrim(NEW.external_id);
    IF NEW.external_id = '' THEN
      NEW.external_id := NULL;
    END IF;
  END IF;

  -- If provider/import sends an official ID for a message we already stored
  -- without an ID, attach the ID to the existing row and skip the duplicate.
  IF NEW.external_id IS NOT NULL THEN
    SELECT id INTO _existing_id
    FROM public.messages
    WHERE tenant_id = NEW.tenant_id
      AND conversation_id IS NOT DISTINCT FROM NEW.conversation_id
      AND direction = NEW.direction
      AND COALESCE(NULLIF(body, ''), NULLIF(content, '')) = _new_body
      AND external_id IS NULL
      AND abs(extract(epoch from (created_at - NEW.created_at))) <= 120
    ORDER BY abs(extract(epoch from (created_at - NEW.created_at))) ASC, created_at ASC
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      UPDATE public.messages
      SET external_id = NEW.external_id,
          whatsapp_instance_id = COALESCE(messages.whatsapp_instance_id, NEW.whatsapp_instance_id),
          status = COALESCE(NULLIF(NEW.status, ''), messages.status),
          metadata = messages.metadata || COALESCE(NEW.metadata, '{}'::jsonb)
      WHERE id = _existing_id;
      RETURN NULL;
    END IF;
  END IF;

  -- Last-resort protection for duplicate webhooks / repeated function runs.
  -- The small window avoids hiding normal repeated conversation content.
  IF _new_body IS NOT NULL THEN
    SELECT id INTO _existing_id
    FROM public.messages
    WHERE tenant_id = NEW.tenant_id
      AND conversation_id IS NOT DISTINCT FROM NEW.conversation_id
      AND direction = NEW.direction
      AND COALESCE(NULLIF(body, ''), NULLIF(content, '')) = _new_body
      AND abs(extract(epoch from (created_at - NEW.created_at))) <= 10
    ORDER BY
      CASE WHEN external_id IS NOT NULL THEN 0 ELSE 1 END,
      abs(extract(epoch from (created_at - NEW.created_at))) ASC,
      created_at ASC
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_message_insert ON public.messages;
CREATE TRIGGER trg_prevent_duplicate_message_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_message_insert();