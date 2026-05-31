
WITH t AS (SELECT '9ecb99e2-50ee-404f-920b-81cd94cc685e'::uuid AS tid),
d1 AS (DELETE FROM public.coaching_message_analysis WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d2 AS (DELETE FROM public.coaching_insights WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d3 AS (DELETE FROM public.messages WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d4 AS (DELETE FROM public.conversations WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d5 AS (DELETE FROM public.gamification_events WHERE tenant_id = (SELECT tid FROM t) AND lead_id IS NOT NULL RETURNING 1),
d6 AS (DELETE FROM public.lead_notifications WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d7 AS (DELETE FROM public.notification_queue WHERE tenant_id = (SELECT tid FROM t) AND lead_id IS NOT NULL RETURNING 1),
d8 AS (DELETE FROM public.appointments WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d9 AS (DELETE FROM public.sheet_imported_rows WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d10 AS (DELETE FROM public.lead_transfer_requests WHERE tenant_id = (SELECT tid FROM t) RETURNING 1),
d11 AS (DELETE FROM public.meeting_recordings WHERE tenant_id = (SELECT tid FROM t) AND lead_id IS NOT NULL RETURNING 1),
d12 AS (DELETE FROM public.leads WHERE tenant_id = (SELECT tid FROM t) RETURNING 1)
SELECT 1;
