// Google Calendar + Meet edge function (gateway-based)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

function gw(path: string) {
  return `${GATEWAY_URL}${path}`;
}

async function gcalFetch(path: string, init: RequestInit = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_CALENDAR_API_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY is not configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(gw(path), { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`Google Calendar API ${res.status}: ${msg}`);
  }
  return json;
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getUserTenant(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token) throw new Error("not authenticated");
  const admin = getAdminClient();
  const { data: userRes, error: ue } = await admin.auth.getUser(token);
  if (ue || !userRes.user) throw new Error("invalid session");
  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (!profile?.tenant_id) throw new Error("no tenant");
  return { tenantId: profile.tenant_id as string, userId: userRes.user.id, admin };
}

async function upsertIntegration(admin: ReturnType<typeof getAdminClient>, tenantId: string, patch: Record<string, unknown>) {
  await admin.from("google_integration").upsert(
    { tenant_id: tenantId, is_connected: true, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const { tenantId, admin } = await getUserTenant(req);

    // VERIFY connection -------------------------------------------------------
    if (action === "verify") {
      const data = await gcalFetch("/users/me/calendarList?maxResults=10");
      const primary = (data.items || []).find((c: any) => c.primary) || data.items?.[0];
      await upsertIntegration(admin, tenantId, {
        google_account_email: primary?.id ?? null,
        calendar_id: primary?.id ?? "primary",
        last_sync_error: null,
      });
      return new Response(
        JSON.stringify({ ok: true, email: primary?.id, calendars: data.items?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // LIST events -------------------------------------------------------------
    if (action === "list_events") {
      const calendarId = encodeURIComponent(body.calendar_id || "primary");
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(body.max_results ?? 50),
      });
      if (body.time_min) params.set("timeMin", body.time_min);
      if (body.time_max) params.set("timeMax", body.time_max);
      const data = await gcalFetch(`/calendars/${calendarId}/events?${params.toString()}`);
      return new Response(JSON.stringify({ ok: true, items: data.items ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SYNC a single appointment (create or update) ----------------------------
    if (action === "sync_appointment") {
      const appointmentId = body.appointment_id as string;
      const createMeet = body.create_meet !== false;
      if (!appointmentId) throw new Error("appointment_id required");

      const { data: appt, error: ae } = await admin
        .from("appointments")
        .select("*, lead:leads(name, email, phone)")
        .eq("id", appointmentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (ae || !appt) throw new Error("appointment not found");

      const start = new Date(appt.scheduled_at);
      const end = new Date(start.getTime() + (appt.duration_minutes || 30) * 60_000);
      const leadName = (appt as any).lead?.name || (appt as any).lead?.phone || "Lead";
      const leadEmail = (appt as any).lead?.email as string | undefined;

      const attendees: any[] = Array.isArray(appt.attendees) ? [...appt.attendees] : [];
      if (leadEmail && !attendees.some((a: any) => a.email === leadEmail)) {
        attendees.push({ email: leadEmail, displayName: leadName });
      }

      const eventBody: any = {
        summary: appt.title ? `${appt.title} — ${leadName}` : `Reunião — ${leadName}`,
        description: appt.description || appt.notes || undefined,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: attendees.length ? attendees : undefined,
        reminders: { useDefault: true },
      };

      if (createMeet && !appt.google_event_id) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: `appt-${appointmentId}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const calendarId = encodeURIComponent(appt.google_calendar_id || "primary");
      const qs = createMeet ? "?conferenceDataVersion=1" : "";
      let event: any;
      if (appt.google_event_id) {
        event = await gcalFetch(
          `/calendars/${calendarId}/events/${encodeURIComponent(appt.google_event_id)}${qs}`,
          { method: "PATCH", body: JSON.stringify(eventBody) },
        );
      } else {
        event = await gcalFetch(`/calendars/${calendarId}/events${qs}`, {
          method: "POST",
          body: JSON.stringify(eventBody),
        });
      }

      const meetLink =
        event?.hangoutLink ||
        event?.conferenceData?.entryPoints?.find?.((e: any) => e.entryPointType === "video")?.uri ||
        null;

      await admin
        .from("appointments")
        .update({
          google_event_id: event.id,
          google_calendar_id: appt.google_calendar_id || "primary",
          google_sync_status: "synced",
          google_synced_at: new Date().toISOString(),
          meet_link: meetLink ?? appt.meet_link,
        })
        .eq("id", appointmentId);

      await upsertIntegration(admin, tenantId, { last_calendar_sync_at: new Date().toISOString(), last_sync_error: null });

      return new Response(
        JSON.stringify({ ok: true, event_id: event.id, meet_link: meetLink, html_link: event.htmlLink }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // DELETE event ------------------------------------------------------------
    if (action === "delete_event") {
      const appointmentId = body.appointment_id as string;
      const { data: appt } = await admin
        .from("appointments")
        .select("google_event_id, google_calendar_id")
        .eq("id", appointmentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (appt?.google_event_id) {
        const calendarId = encodeURIComponent(appt.google_calendar_id || "primary");
        await gcalFetch(`/calendars/${calendarId}/events/${encodeURIComponent(appt.google_event_id)}`, {
          method: "DELETE",
        });
      }
      await admin.from("appointments").update({
        google_event_id: null, google_sync_status: "deleted", meet_link: null,
      }).eq("id", appointmentId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[google-calendar]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
