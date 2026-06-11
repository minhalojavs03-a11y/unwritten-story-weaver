// Sync exclusive leads for Nilton from a public Google Sheets CSV export.
// Publicly callable (verify_jwt = false). Idempotent (upsert by sheet_id).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1mNfWIEfaqp_oZtv6i1tWzhCmFvEaKQGb4EmrX8RG5vY/export?format=csv&gid=0";

// Hard-coded Nilton identity (looked up once via DB; fallback constants used
// here to keep the function robust even if a profile row is renamed).
const NILTON_USER_ID = "88d35577-6f4b-4d34-b29e-b5cfdd09580c";
const NILTON_TENANT_ID = "92c02689-0764-48d1-8ecb-428446b11ed1";
const NILTON_PHONE = "5499957-0101"; // formatted later
const FERACON_TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";
const NILTON_DAILY_LIMIT = 2; // máximo de leads por dia para Nilton; o restante cai na distribuição geral

function parseCartaValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9,\.]/g, "").trim();
  if (!cleaned) return null;
  // Formato BR: "50.000,00" -> remove pontos de milhar, troca vírgula por ponto
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  return isFinite(n) && n > 0 ? n : null;
}

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

// Minimal CSV parser supporting quoted fields with embedded commas/newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ""; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v && v.trim().length));
}

function parseBool(v: string | undefined): boolean {
  return String(v ?? "").trim().toLowerCase() === "true";
}

function parseDate(v: string | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function looksLikeTest(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  return joined.includes("test lead") || joined.includes("dummy data");
}

async function getWhatsAppInstance(tenantId: string) {
  const r = await sb(
    `/whatsapp_instances?tenant_id=eq.${tenantId}&is_connected=eq.true&select=id,server_url,instance_token&order=created_at.asc&limit=1`,
  );
  const [inst] = (await r.json()) ?? [];
  return inst ?? null;
}

async function enqueueWhatsAppNotice(tenantId: string, phone: string, text: string) {
  try {
    await sb(`/notification_queue`, {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        type: "nilton_lead",
        recipient_phone: phone,
        message_text: text,
        status: "pending",
      }),
    });
  } catch (e) {
    console.error("queue insert failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();
  let rowsFetched = 0, rowsInserted = 0, rowsSkipped = 0, errorMessage: string | null = null;
  try {
    const res = await fetch(SHEET_CSV_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`sheet fetch ${res.status}`);
    const csv = await res.text();
    const grid = parseCSV(csv);
    if (grid.length < 2) throw new Error("empty sheet");

    const dataRows = grid.slice(1);
    rowsFetched = dataRows.length;

    // Lookup Nilton (fallback to constants).
    const profRes = await sb(
      `/profiles?or=(username.eq.nilton,display_name.ilike.Nilton*,full_name.ilike.Nilton*)&select=id,tenant_id,phone&limit=1`,
    );
    const prof = (await profRes.json())?.[0] ?? null;
    const niltonUserId = prof?.id ?? NILTON_USER_ID;
    const niltonTenantId = prof?.tenant_id ?? NILTON_TENANT_ID;
    const niltonPhone = (prof?.phone ?? NILTON_PHONE)?.toString();

    // Conta quantos leads o Nilton já recebeu HOJE (status != 'overflow' e não histórico)
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const todayRes = await sb(
      `/nilton_leads?select=id&assigned_to=eq.${niltonUserId}&created_time=gte.${startOfDay.toISOString()}&status=not.in.(overflow,historico)`,
    );
    let niltonTodayCount = Array.isArray(await todayRes.clone().json()) ? (await todayRes.json()).length : 0;

    for (const row of dataRows) {
      const sheet_id = (row[0] ?? "").trim();
      if (!sheet_id) { rowsSkipped++; continue; }
      if (looksLikeTest(row)) { rowsSkipped++; continue; }

      // Check existence first — existing leads NEVER have their tenant/assigned/status changed.
      const existsRes = await sb(`/nilton_leads?sheet_id=eq.${encodeURIComponent(sheet_id)}&select=id&limit=1`);
      const existing = (await existsRes.json())?.[0] ?? null;

      const basePayload = {
        sheet_id,
        created_time: parseDate(row[1]),
        ad_id: row[2] ?? null,
        ad_name: row[3] ?? null,
        adset_id: row[4] ?? null,
        adset_name: row[5] ?? null,
        campaign_id: row[6] ?? null,
        campaign_name: row[7] ?? null,
        form_id: row[8] ?? null,
        form_name: row[9] ?? null,
        is_organic: parseBool(row[10]),
        platform: row[11] ?? null,
        carta_value: row[12] ?? null,
        nome_completo: row[13] ?? null,
        telefone: (row[14] ?? "").toString().replace(/^p:/i, "").trim() || null,
        lead_status: (row[15] ?? "CREATED OK").trim() || "CREATED OK",
      };

      if (existing) {
        // Update only neutral data fields — preserve assignment/status/tenant.
        const patch = await sb(`/nilton_leads?id=eq.${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(basePayload),
        });
        if (!patch.ok) { console.error("patch failed", await patch.text()); rowsSkipped++; }
        continue;
      }

      const overflow = niltonTodayCount >= NILTON_DAILY_LIMIT;
      const payload = {
        ...basePayload,
        tenant_id: overflow ? FERACON_TENANT_ID : niltonTenantId,
        assigned_to: overflow ? null : niltonUserId,
        status: overflow ? "overflow" : "novo",
      };

      const insert = await sb(`/nilton_leads`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!insert.ok) {
        const t = await insert.text();
        console.error("insert failed", t);
        rowsSkipped++;
        continue;
      }
      rowsInserted++;

      if (overflow) {
        // Encaminha para distribuição geral da equipe Feracon: cria um lead
        // normal — o trigger notify_consultant_by_tier cuida do round-robin.
        const creditValue = parseCartaValue(payload.carta_value);
        try {
          await sb(`/leads`, {
            method: "POST",
            body: JSON.stringify({
              tenant_id: FERACON_TENANT_ID,
              name: payload.nome_completo ?? "Lead RS",
              phone: payload.telefone,
              source: "nilton_sheet_overflow",
              credit_value: creditValue,
              imported_from_sheet: true,
              metadata: {
                sheet_id,
                origin: "nilton_overflow",
                campaign_name: payload.campaign_name,
                carta_value: payload.carta_value,
              },
            }),
          });
        } catch (e) {
          console.error("overflow lead insert failed", e);
        }
        continue;
      }

      niltonTodayCount++;
      // App notification para Nilton
      await sb(`/app_notifications`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: niltonTenantId,
          recipient_user_id: niltonUserId,
          type: "nilton_lead",
          title: "Novo lead Rio Grande do Sul!",
          body: `👤 ${payload.nome_completo ?? "Sem nome"} · 💰 ${payload.carta_value ?? "-"}`,
          metadata: { sheet_id, source: "nilton_sheet" },
        }),
      });
      if (niltonPhone) {
        const text = `🎯 *Novo lead RS!*\n\n👤 ${payload.nome_completo ?? "Sem nome"}\n💰 Carta: ${payload.carta_value ?? "-"}\n📣 Campanha: ${payload.campaign_name ?? "-"}\n\nAcesse o CRM para atender.`;
        await enqueueWhatsAppNotice(niltonTenantId, niltonPhone, text);
      }
    }
  } catch (e) {
    errorMessage = (e as Error).message ?? String(e);
    console.error("sync-nilton-leads error", errorMessage);
  } finally {
    const duration_ms = Date.now() - startedAt;
    try {
      await sb(`/nilton_sync_log`, {
        method: "POST",
        body: JSON.stringify({
          rows_fetched: rowsFetched,
          rows_inserted: rowsInserted,
          rows_skipped: rowsSkipped,
          error_message: errorMessage,
          duration_ms,
        }),
      });
    } catch (e) { console.error("log insert failed", e); }
  }

  return new Response(
    JSON.stringify({ ok: !errorMessage, rowsFetched, rowsInserted, rowsSkipped, errorMessage }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
