DO $$
DECLARE
  v_tenant uuid := '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid;
  v_instance uuid := '46928de5-7b68-43b1-8913-f0a1ceea44c1'::uuid;
BEGIN
  CREATE TEMP TABLE cleanup_leads ON COMMIT DROP AS
    SELECT id
    FROM public.leads
    WHERE tenant_id = v_tenant
      AND whatsapp_instance_id = v_instance
      AND source = 'WhatsApp';

  CREATE TEMP TABLE cleanup_conversations ON COMMIT DROP AS
    SELECT id
    FROM public.conversations
    WHERE tenant_id = v_tenant
      AND (
        whatsapp_instance_id = v_instance
        OR lead_id IN (SELECT id FROM cleanup_leads)
      );

  DELETE FROM public.coaching_insights
  WHERE tenant_id = v_tenant
    AND (conversation_id IN (SELECT id FROM cleanup_conversations) OR lead_id IN (SELECT id FROM cleanup_leads));

  DELETE FROM public.coaching_message_analysis
  WHERE tenant_id = v_tenant
    AND conversation_id IN (SELECT id FROM cleanup_conversations);

  DELETE FROM public.notification_queue
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.lead_notifications
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.lead_transfer_requests
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.gamification_events
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.appointments
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.meeting_recordings
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.sheet_imported_rows
  WHERE tenant_id = v_tenant
    AND lead_id IN (SELECT id FROM cleanup_leads);

  DELETE FROM public.messages
  WHERE tenant_id = v_tenant
    AND (
      whatsapp_instance_id = v_instance
      OR conversation_id IN (SELECT id FROM cleanup_conversations)
      OR lead_id IN (SELECT id FROM cleanup_leads)
    );

  DELETE FROM public.conversations
  WHERE id IN (SELECT id FROM cleanup_conversations);

  DELETE FROM public.leads
  WHERE id IN (SELECT id FROM cleanup_leads);

  UPDATE public.whatsapp_instances
  SET metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'test_history_cleaned_at', now(),
        'auto_history_import_disabled', true,
        'cleaned_reason', 'Removido histórico importado do primeiro número teste antes da criação do supervisor'
      ),
      updated_at = now()
  WHERE id = v_instance
    AND tenant_id = v_tenant;
END $$;