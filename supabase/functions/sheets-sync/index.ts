// Sheets → Leads sync. Publicly callable (verify_jwt = false). Idempotent.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY")!;

// === MODO ESTABILIDADE: delay aleatório antes de cada envio (remover quando voltar ao normal).
async function randomSendDelay(): Promise<void> {
  let ms = 5000 + Math.floor(Math.random() * 55000);
  if (Math.random() < 0.1) ms += 30000 + Math.floor(Math.random() * 60000);
  console.log("[stability] sleeping", ms, "ms before send");
  await new Promise((r) => setTimeout(r, ms));
}

function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

// Generate phone match variants handling Brazilian mobile 9-digit prefix.
// WhatsApp Cloud API sometimes returns numbers without the leading "9"
// after the DDD, while the sheet/lead may have it with the "9".
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const set = new Set<string>();
  if (!digits) return [];
  set.add(digits);
  set.add(`+${digits}`);
  // 13 digits with 9 after DDD → also try without 9 (12 digits)
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    const without9 = digits.slice(0, 4) + digits.slice(5);
    set.add(without9);
    set.add(`+${without9}`);
  }
  // 12 digits → also try with 9 (13 digits)
  if (digits.length === 12 && digits.startsWith("55")) {
    const with9 = digits.slice(0, 4) + "9" + digits.slice(4);
    set.add(with9);
    set.add(`+${with9}`);
  }
  return [...set];
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

async function sendWelcome(tenantId: string, lead: any) {
  try {
    // Find the primary connected WhatsApp instance for this tenant
    const instRes = await sb(
      `/whatsapp_instances?tenant_id=eq.${tenantId}&is_connected=eq.true&select=id,server_url,instance_token,seller_user_id&order=created_at.asc&limit=1`,
    );
    const [instance] = (await instRes.json()) ?? [];
    if (!instance?.server_url || !instance?.instance_token) {
      console.log("welcome skipped: no connected instance", tenantId);
      return;
    }
    if (!lead?.phone) return;

    // Tenant name
    const tRes = await sb(`/tenants?id=eq.${tenantId}&select=name`);
    const [tenant] = (await tRes.json()) ?? [];
    const company = tenant?.name || "nossa equipe";

    const firstName = (lead.name || "").trim().split(/\s+/)[0] || "tudo bem";
    const interestLine = lead.interest
      ? `Vi aqui que você tem interesse em *${lead.interest}* — me confirma se está correto? `
      : "";
    const text =
      `Olá, ${firstName}! 👋 Aqui é o atendimento da *${company} Consórcios*. ` +
      `Recebemos seu contato e queremos te ajudar a realizar esse sonho. 🏡🚗\n\n` +
      interestLine +
      `Posso te enviar agora as opções de carta e parcela que mais se encaixam no seu perfil?`;

    const phoneDigits = String(lead.phone).replace(/\D/g, "");

    // Send via provider
    await randomSendDelay();
    const r = await fetch(`${instance.server_url.replace(/\/$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instance.instance_token },
      body: JSON.stringify({ number: phoneDigits, text, message: text }),
    });
    if (!r.ok) {
      console.error("welcome send failed", r.status, (await r.text()).slice(0, 200));
      return;
    }

    // Update lead instance + last_message_at
    await sb(`/leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        whatsapp_instance_id: instance.id,
        last_message_at: new Date().toISOString(),
      }),
    });

    // Ensure conversation
    const cRes = await sb(
      `/conversations?tenant_id=eq.${tenantId}&lead_id=eq.${lead.id}&select=id&limit=1`,
    );
    let [conv] = (await cRes.json()) ?? [];
    if (!conv) {
      const newConvRes = await sb(`/conversations`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          lead_id: lead.id,
          whatsapp_instance_id: instance.id,
          channel: "whatsapp",
          status: "open",
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 120),
        }),
      });
      [conv] = (await newConvRes.json()) ?? [];
    } else {
      await sb(`/conversations?id=eq.${conv.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 120),
        }),
      });
    }

    if (conv) {
      await sb(`/messages`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          conversation_id: conv.id,
          lead_id: lead.id,
          whatsapp_instance_id: instance.id,
          direction: "outbound",
          body: text,
          content: text,
          status: "sent",
          metadata: { welcome: true, source: "sheets-sync" },
        }),
      });
    }

    await sb(`/lead_notifications`, {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        lead_id: lead.id,
        type: "welcome",
        recipient_phone: phoneDigits,
        message_sent: text,
        delivered: true,
      }),
    });
  } catch (e) {
    console.error("sendWelcome error", e);
  }
}

async function syncConfig(cfg: any, opts: { skipWelcome?: boolean } = {}) {
  const tabName = cfg.tab_name || "Sheet1";
  const range = `${tabName}!A1:ZZ10000`;
  const url = `${GATEWAY}/spreadsheets/${cfg.sheet_id}/values/${encodeURIComponent(range).replace(/%21/g, "!").replace(/%3A/g, ":")}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows: string[][] = data.values || [];
  const headerRow = (cfg.header_row || 1) - 1;
  const startIdx = Math.max(cfg.last_row_synced || headerRow + 1, headerRow + 1);

  const mapping = cfg.column_mapping || {};
  const colNome = colLetterToIndex(mapping.nome || "A");
  const colTel = colLetterToIndex(mapping.telefone || "B");
  const colEmail = mapping.email ? colLetterToIndex(mapping.email) : -1;
  const colInteresse = mapping.interesse ? colLetterToIndex(mapping.interesse) : -1;

  // Distribution: round-robin entre tenants configurados.
  // Se vazio, mantém comportamento legado (tudo no tenant da config).
  const distTenants: string[] = Array.isArray(cfg.distribution_tenant_ids) && cfg.distribution_tenant_ids.length > 0
    ? cfg.distribution_tenant_ids
    : [cfg.tenant_id];
  // Resolve owner user_id de cada tenant alvo (para assigned_to)
  const tenantOwners = new Map<string, string | null>();
  for (const tId of distTenants) {
    const ownerRes = await sb(`/tenant_memberships?tenant_id=eq.${tId}&role=eq.owner&select=user_id&limit=1`);
    const [own] = (await ownerRes.json()) ?? [];
    tenantOwners.set(tId, own?.user_id || null);
  }
  // Contador para round-robin: começa pela quantidade já importada
  const cntRes = await sb(`/sheet_imported_rows?sheet_sync_config_id=eq.${cfg.id}&select=id`);
  const cntArr = await cntRes.json();
  let distCursor = Array.isArray(cntArr) ? cntArr.length : 0;

  let newCount = 0;
  let lastRow = startIdx;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c || !String(c).trim())) continue;

    const name = row[colNome]?.toString().trim() || null;
    const phone = normalizePhone(row[colTel]);
    const email = colEmail >= 0 ? row[colEmail]?.toString().trim() || null : null;
    const interest = colInteresse >= 0 ? row[colInteresse]?.toString().trim() || null : null;

    // Skip Meta test leads
    if (name?.includes("<test lead:")) {
      lastRow = i + 1;
      continue;
    }
    if (!name && !phone) {
      lastRow = i + 1;
      continue;
    }

    // Dedupe by row_index
    const dedupeRes = await sb(
      `/sheet_imported_rows?tenant_id=eq.${cfg.tenant_id}&sheet_sync_config_id=eq.${cfg.id}&row_index=eq.${i}&select=id`,
    );
    const existing = await dedupeRes.json();
    if (existing.length > 0) {
      lastRow = i + 1;
      continue;
    }

    // Merge por telefone: se já existe um lead com esse telefone no tenant
    // (geralmente criado pelo webhook do WhatsApp sem nome), atualizamos
    // nome/interesse/email em vez de duplicar.
    let lead: any = null;
    let isNewLead = false;
    if (phone) {
      const variants = phoneVariants(phone);
      const orFilter = variants.map((v) => `phone.eq.${encodeURIComponent(v)}`).join(",");
      const existingLeadRes = await sb(
        `/leads?tenant_id=eq.${cfg.tenant_id}&or=(${orFilter})&select=id,name,email,interest&limit=1`,
      );
      const existingLeads = await existingLeadRes.json();
      if (Array.isArray(existingLeads) && existingLeads[0]) {
        const ex = existingLeads[0];
        const patch: Record<string, any> = { imported_from_sheet: true, sheet_row_index: i };
        if (!ex.name && name) patch.name = name;
        if (!ex.email && email) patch.email = email;
        if (!ex.interest && interest) patch.interest = interest;
        const upd = await sb(`/leads?id=eq.${ex.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        const [updated] = (await upd.json()) ?? [];
        lead = updated || { id: ex.id, ...ex, ...patch };
      }
    }

    if (!lead) {
      // Create lead
      const leadRes = await sb(`/leads`, {
        method: "POST",
        body: JSON.stringify({
          tenant_id: cfg.tenant_id,
          name,
          phone,
          email,
          interest,
          source: "meta_ads",
          stage: "novo",
          temperature: "hot",
          imported_from_sheet: true,
          sheet_row_index: i,
          metadata: { raw_row: row },
        }),
      });
      if (!leadRes.ok) {
        console.error("lead insert failed", await leadRes.text());
        continue;
      }
      [lead] = await leadRes.json();
      isNewLead = true;
    }

    await sb(`/sheet_imported_rows`, {
      method: "POST",
      body: JSON.stringify({
        tenant_id: cfg.tenant_id,
        sheet_sync_config_id: cfg.id,
        row_index: i,
        raw_data: { row },
        lead_id: lead.id,
      }),
    });

    // Welcome message via WhatsApp — apenas para leads realmente novos
    if (isNewLead && !opts.skipWelcome) {
      await sendWelcome(cfg.tenant_id, { ...lead, name, phone, interest });
    }


    newCount++;
    lastRow = i + 1;
  }

  // Update config last_sync
  await sb(`/sheet_sync_config?id=eq.${cfg.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
      last_row_synced: lastRow,
    }),
  });

  // Log
  await sb(`/sheet_sync_logs`, {
    method: "POST",
    body: JSON.stringify({
      tenant_id: cfg.tenant_id,
      sheet_sync_config_id: cfg.id,
      status: "success",
      summary: `Sincronizado: ${newCount} novo(s) lead(s).`,
      new_leads_count: newCount,
    }),
  });

  return { config_id: cfg.id, new_leads: newCount };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Optional: sync a single config by id (from admin "Sincronizar agora")
    let onlyConfigId: string | null = null;
    let skipWelcome = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        onlyConfigId = body?.config_id || null;
        skipWelcome = body?.skip_welcome === true;
      } catch (_) { /* empty body ok */ }
    }

    const filter = onlyConfigId
      ? `?id=eq.${onlyConfigId}`
      : `?is_active=eq.true`;
    const cfgRes = await sb(`/sheet_sync_config${filter}&select=*`);
    const configs = await cfgRes.json();

    const results = [];
    for (const cfg of configs) {
      try {
        results.push(await syncConfig(cfg, { skipWelcome }));
      } catch (e: any) {
        console.error("sync failed", cfg.id, e?.message);
        await sb(`/sheet_sync_config?id=eq.${cfg.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: String(e?.message || e).slice(0, 500),
          }),
        });
        await sb(`/sheet_sync_logs`, {
          method: "POST",
          body: JSON.stringify({
            tenant_id: cfg.tenant_id,
            sheet_sync_config_id: cfg.id,
            status: "error",
            error_message: String(e?.message || e).slice(0, 500),
          }),
        });
        results.push({ config_id: cfg.id, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
