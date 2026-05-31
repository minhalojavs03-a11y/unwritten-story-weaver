
WITH conv_ids AS (
  SELECT unnest(ARRAY[
    'b695e271-b3b0-4f8d-84b8-1d1cd4d77b82'::uuid,
    'ea38f892-02d4-4985-b1b3-7692d2b6b504'::uuid,
    'bf056cf0-dd62-41a2-9a5e-b67d0965a15f'::uuid
  ]) AS id
),
lead_ids AS (
  SELECT unnest(ARRAY[
    'd436bf48-2015-4e83-8ce3-63963185e911'::uuid,
    '2b840aed-d38c-4698-9a43-2420c0cf1ad8'::uuid,
    '875c3a28-ac8c-44b8-b6aa-24176e0226c3'::uuid
  ]) AS id
),
del_msgs AS (DELETE FROM public.messages WHERE conversation_id IN (SELECT id FROM conv_ids) OR lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_coach AS (DELETE FROM public.coaching_insights WHERE conversation_id IN (SELECT id FROM conv_ids) OR lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_cma AS (DELETE FROM public.coaching_message_analysis WHERE conversation_id IN (SELECT id FROM conv_ids) RETURNING 1),
del_gam AS (DELETE FROM public.gamification_events WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_notif AS (DELETE FROM public.lead_notifications WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_nq AS (DELETE FROM public.notification_queue WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_appt AS (DELETE FROM public.appointments WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_sir AS (DELETE FROM public.sheet_imported_rows WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_ltr AS (DELETE FROM public.lead_transfer_requests WHERE lead_id IN (SELECT id FROM lead_ids) RETURNING 1),
del_conv AS (DELETE FROM public.conversations WHERE id IN (SELECT id FROM conv_ids) RETURNING 1),
del_leads AS (DELETE FROM public.leads WHERE id IN (SELECT id FROM lead_ids) RETURNING 1)
SELECT 1;
