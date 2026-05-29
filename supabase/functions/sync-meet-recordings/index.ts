// Sync Google Meet recordings from Google Drive into meeting_recordings
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DRIVE_GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

async function driveFetch(path: string, params: Record<string, string> = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY missing");
  const qs = new URLSearchParams(params).toString();
  const url = `${DRIVE_GATEWAY}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Drive API [${res.status}]: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function syncTenantRecordings(admin: any, tenantId: string) {
  // 1) Find "Meet Recordings" folder(s)
  const folderQ = `mimeType='application/vnd.google-apps.folder' and name='Meet Recordings' and trashed=false`;
  const folders = await driveFetch("/files", {
    q: folderQ,
    fields: "files(id,name)",
    pageSize: "10",
  });

  const folderIds: string[] = (folders.files ?? []).map((f: any) => f.id);

  // 2) Query: video files inside those folders, OR by name pattern as fallback
  const queries: string[] = [];
  if (folderIds.length) {
    const parents = folderIds.map((id) => `'${id}' in parents`).join(" or ");
    queries.push(`(${parents}) and mimeType contains 'video/' and trashed=false`);
  }
  queries.push(`mimeType contains 'video/' and (name contains 'Meet Recording' or name contains 'Gravação do Meet') and trashed=false`);

  const seen = new Set<string>();
  const allFiles: any[] = [];
  for (const q of queries) {
    const r = await driveFetch("/files", {
      q,
      fields: "files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,size,iconLink)",
      pageSize: "200",
      orderBy: "createdTime desc",
    });
    for (const f of (r.files ?? [])) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        allFiles.push(f);
      }
    }
  }

  // 3) Pull existing recordings
  const { data: existing } = await admin
    .from("meeting_recordings")
    .select("id, google_drive_file_id")
    .eq("tenant_id", tenantId)
    .not("google_drive_file_id", "is", null);
  const existingIds = new Set((existing ?? []).map((r: any) => r.google_drive_file_id));

  // 4) Load appointments
  const { data: appts } = await admin
    .from("appointments")
    .select("id, lead_id, assigned_member_id, scheduled_at, meeting_type")
    .eq("tenant_id", tenantId)
    .order("scheduled_at", { ascending: false })
    .limit(500);

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const f of allFiles) {
    if (existingIds.has(f.id)) { skipped++; continue; }

    const recordedAt = f.createdTime ?? f.modifiedTime ?? new Date().toISOString();
    const recordedMs = new Date(recordedAt).getTime();

    let match: any = null;
    let bestDelta = Infinity;
    for (const a of appts ?? []) {
      const d = Math.abs(new Date(a.scheduled_at).getTime() - recordedMs);
      if (d < bestDelta && d <= 6 * 60 * 60 * 1000) {
        bestDelta = d;
        match = a;
      }
    }

    const durationMs = f.videoMediaMetadata?.durationMillis
      ? Number(f.videoMediaMetadata.durationMillis)
      : null;

    const row = {
      tenant_id: tenantId,
      appointment_id: match?.id ?? null,
      lead_id: match?.lead_id ?? null,
      consultant_member_id: match?.assigned_member_id ?? null,
      title: f.name ?? "Gravação do Meet",
      meeting_type: match?.meeting_type ?? "simulacao",
      recorded_at: recordedAt,
      duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
      google_drive_file_id: f.id,
      video_url: f.webViewLink ?? null,
      thumbnail_url: f.thumbnailLink ?? null,
      source: "google_drive",
      metadata: {
        mimeType: f.mimeType,
        size: f.size,
        webContentLink: f.webContentLink,
        iconLink: f.iconLink,
      },
    };

    const { error } = await admin.from("meeting_recordings").insert(row);
    if (error) errors.push(`${f.name}: ${error.message}`);
    else inserted++;
  }

  return { scanned: allFiles.length, inserted, skipped, folders_found: folderIds.length, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cronSecret = Deno.env.get("CRON_SECRET");
    const reqCronSecret = req.headers.get("x-cron-secret");

    // === CRON MODE: sync all connected tenants ===
    if (cronSecret && reqCronSecret === cronSecret) {
      const { data: integrations, error: intErr } = await admin
        .from("google_integration")
        .select("tenant_id")
        .eq("is_connected", true);

      if (intErr) throw new Error(`Failed to load integrations: ${intErr.message}`);

      const tenantIds = [...new Set((integrations ?? []).map((i: any) => i.tenant_id))];
      const results: any[] = [];

      for (const tenantId of tenantIds) {
        try {
          const r = await syncTenantRecordings(admin, tenantId);
          results.push({ tenant_id: tenantId, ...r });
        } catch (e: any) {
          results.push({ tenant_id: tenantId, error: e?.message ?? "unknown" });
        }
      }

      // Update last sync timestamp
      if (tenantIds.length) {
        await admin.from("google_integration")
          .update({ last_recordings_sync_at: new Date().toISOString() })
          .in("tenant_id", tenantIds);
      }

      return new Response(JSON.stringify({ ok: true, cron: true, tenants: results.length, results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === USER MODE: single tenant from JWT ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("id", user.id).single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "no_tenant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await syncTenantRecordings(admin, tenantId);

    await admin.from("google_integration")
      .update({ last_recordings_sync_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    return new Response(JSON.stringify({ ok: true, ...r }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("sync-meet-recordings error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
