CREATE OR REPLACE FUNCTION public.prevent_duplicate_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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

  -- Provider/import sent an official ID for a row we already stored without one:
  -- attach the ID to the existing row and skip the duplicate insert.
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

  -- Last-resort dedupe for repeated webhooks. Only applies to plain TEXT
  -- messages without media. Media uploads (image/audio/video/document) often
  -- share placeholder body like "📷 Imagem" and must never be deduped here —
  -- each upload has a unique media_url.
  IF _new_body IS NOT NULL
     AND NEW.media_url IS NULL
     AND COALESCE(NEW.message_type, 'text') = 'text' THEN
    SELECT id INTO _existing_id
    FROM public.messages
    WHERE tenant_id = NEW.tenant_id
      AND conversation_id IS NOT DISTINCT FROM NEW.conversation_id
      AND direction = NEW.direction
      AND media_url IS NULL
      AND COALESCE(message_type, 'text') = 'text'
      AND COALESCE(NULLIF(body, ''), NULLIF(content, '')) = _new_body
      AND abs(extract(epoch from (created_at - NEW.created_at))) <= 3
      -- Inbound webhooks are the real source of duplicates; outbound from the
      -- UI should never be silently dropped because the user may legitimately
      -- repeat the same short reply ("ok", "sim") seconds apart.
      AND NEW.direction = 'inbound'
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
$function$;