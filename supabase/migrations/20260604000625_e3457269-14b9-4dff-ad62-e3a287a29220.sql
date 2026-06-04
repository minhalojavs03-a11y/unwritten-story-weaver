
WITH ediane_leads AS (
  SELECT id FROM public.leads
  WHERE phone ILIKE '%99874647%' OR phone ILIKE '%998746470%'
),
ediane_convs AS (
  SELECT id FROM public.conversations WHERE lead_id IN (SELECT id FROM ediane_leads)
)
, del_msgs AS (
  DELETE FROM public.messages
  WHERE conversation_id IN (SELECT id FROM ediane_convs)
     OR lead_id IN (SELECT id FROM ediane_leads)
  RETURNING 1
)
, del_coaching AS (
  DELETE FROM public.coaching_insights
  WHERE lead_id IN (SELECT id FROM ediane_leads)
     OR conversation_id IN (SELECT id FROM ediane_convs)
  RETURNING 1
)
, del_coaching_msg AS (
  DELETE FROM public.coaching_message_analysis
  WHERE conversation_id IN (SELECT id FROM ediane_convs)
  RETURNING 1
)
, del_notif AS (
  DELETE FROM public.app_notifications WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_lead_notif AS (
  DELETE FROM public.lead_notifications WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_notif_queue AS (
  DELETE FROM public.notification_queue WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_gam AS (
  DELETE FROM public.gamification_events WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_transfers AS (
  DELETE FROM public.lead_transfer_requests WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_appts AS (
  DELETE FROM public.appointments WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_convs AS (
  DELETE FROM public.conversations WHERE id IN (SELECT id FROM ediane_convs) RETURNING 1
)
, del_sheet AS (
  DELETE FROM public.sheet_imported_rows WHERE lead_id IN (SELECT id FROM ediane_leads) RETURNING 1
)
, del_leads AS (
  DELETE FROM public.leads WHERE id IN (SELECT id FROM ediane_leads) RETURNING 1
)
SELECT 1;
