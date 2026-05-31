import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const WHATSAPI_API_TOKEN = Deno.env.get("WHATSAPI_API_TOKEN") ?? "";
const WHATSAPI_CREATE_URL = Deno.env.get("WHATSAPI_CREATE_URL") ?? "";

// === MODO ESTABILIDADE: delay aleatório antes de cada envio (remover quando voltar ao normal).
async function randomSendDelay(): Promise<void> {
  let ms = 5000 + Math.floor(Math.random() * 55000);
  if (Math.random() < 0.1) ms += 30000 + Math.floor(Math.random() * 60000);
  console.log("[stability] sleeping", ms, "ms before send");
  await new Promise((r) => setTimeout(r, ms));
}

async function sendProviderText(serverUrl: string, instanceToken: string, phone: string, text: string) {
  const r = await fetch(`${serverUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: instanceToken },
    body: JSON.stringify({ number: phone, text }),
  });
  const parsed = await parseProviderResponse(r);
  return { response: r, ...parsed };
}

function providerMessage(data: any, raw: string): string {
  return (data?.message || data?.error || raw || "").toString();
}

async function markMessageFailed(admin: any, messageId: string | null) {
  if (messageId) await admin.from("messages").update({ status: "failed" }).eq("id", messageId);
}

async function markMessageDelivered(admin: any, messageId: string | null, data: any) {
  if (!messageId) return;
  const providerId = data?.id || data?.messageId || data?.key?.id || null;
  await admin.from("messages").update({
    status: "delivered",
    ...(providerId ? { external_id: providerId } : {}),
  }).eq("id", messageId);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(inst: any) {
  if (!inst) return inst;
  const { instance_token, webhook_secret, ...safe } = inst;
  return safe;
}

function isConnectedSignal(d: any): boolean {
  if (!d) return false;
  const inst = d.instance ?? d;
  const status = (inst.status ?? d.status ?? "").toString().toLowerCase();
  if (status === "open" || status === "connected") return true;
  if (inst.connected === true || d.connected === true) return true;
  if (inst.user || inst.owner || inst.profileName) return true;
  if ((!inst.qrcode || inst.qrcode === "") && (inst.profileName || inst.pushname)) return true;
  return false;
}

function isDisconnectedSignal(d: any): boolean {
  if (!d) return false;
  const inst = d.instance ?? d;
  const status = (inst.status ?? d.status ?? inst.state ?? d.state ?? "").toString().toLowerCase();
  return ["disconnected", "disconnect", "closed", "close", "logged_out", "logout"].includes(status) || inst.connected === false || d.connected === false;
}

async function parseProviderResponse(resp: Response) {
  const text = await resp.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { text, data };
}

function getProviderBaseUrl(): string | null {
  const raw = WHATSAPI_CREATE_URL.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const instancePathIndex = url.pathname.indexOf("/instance/");
    if (instancePathIndex >= 0) {
      url.pathname = url.pathname.slice(0, instancePathIndex) || "/";
      url.search = "";
      url.hash = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "").replace(/\/instance\/.+$/, "");
  }
}

function providerEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function getProviderDetails(createData: any, tenant: any) {
  const inst = createData?.instance ?? createData?.data?.instance ?? createData?.data ?? createData;
  const server_url =
    inst?.server_url ?? inst?.serverUrl ?? inst?.server ?? inst?.host ??
    createData?.server_url ?? createData?.serverUrl ?? createData?.server ?? createData?.host ?? null;
  const instance_token =
    createData?.["Instance Token"] ?? createData?.instanceToken ?? createData?.instance_token ??
    inst?.["Instance Token"] ?? inst?.instanceToken ?? inst?.instance_token ??
    inst?.token ?? inst?.apikey ?? inst?.apiKey ?? inst?.hash ??
    createData?.token ?? createData?.apikey ?? createData?.apiKey ?? createData?.hash ?? null;
  const instance_name = inst?.name ?? inst?.instanceName ?? tenant.slug;
  return { server_url, instance_token, instance_name };
}

function hasBadCredentials(instance: any, tenant: any): boolean {
  if (!instance?.server_url || !instance?.instance_token) return true;
  const token = instance.instance_token.toString().trim().toLowerCase();
  return [instance.instance_name, tenant.name, tenant.slug]
    .filter(Boolean)
    .some((v: string) => token === v.toString().trim().toLowerCase());
}

async function hydrateLegacyCredentials(admin: any, instance: any): Promise<any> {
  if (!instance) return instance;
  const serverUrl = instance.server_url ?? instance.metadata?.server_url ?? null;
  const instanceToken = instance.instance_token ?? instance.token ?? null;
  if (instance.server_url && instance.instance_token) return instance;
  if (!serverUrl || !instanceToken) return instance;
  const { data } = await admin
    .from("whatsapp_instances")
    .update({ server_url: serverUrl, instance_token: instanceToken })
    .eq("id", instance.id)
    .select("*")
    .single();
  return data ?? { ...instance, server_url: serverUrl, instance_token: instanceToken };
}

function isAuthProviderError(resp: Response, data: any, text: string): boolean {
  const msg = JSON.stringify(data ?? text).toLowerCase();
  return resp.status === 401 || resp.status === 403 || msg.includes("invalid token") || msg.includes("token inválido");
}

function extractQrCode(payload: any): string | null {
  // Only look at explicit qr-code keys. Do NOT walk generic url/image fields,
  // otherwise we pick up profilePicUrl and confuse it with a QR.
  const qrKeys = ["qrcode", "qrCode", "qr", "pairingCode", "paircode"];
  const containers = ["instance", "data", "response", "result"];
  const seen = new Set<any>();
  const walk = (value: any): string | null => {
    if (!value || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    for (const key of qrKeys) {
      const v = value[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const key of containers) {
      const found = walk(value[key]);
      if (found) return found;
    }
    return null;
  };
  return walk(payload);
}

async function deleteProviderInstance(serverUrl: string | null, token: string | null, providerName: string | null): Promise<void> {
  // Best-effort rollback: try the per-instance endpoint first (uazapi/whatsapi style),
  // then fall back to the global base + name.
  const attempts: Array<{ url: string; headers: Record<string, string> }> = [];
  if (serverUrl && token) {
    attempts.push({ url: `${serverUrl.replace(/\/$/, "")}/instance`, headers: { token } });
  }
  const base = getProviderBaseUrl();
  if (base && providerName) {
    if (WHATSAPI_API_TOKEN) {
      attempts.push({ url: `${base}/instance/${encodeURIComponent(providerName)}`, headers: { token: WHATSAPI_API_TOKEN } });
      attempts.push({ url: `${base}/instance/delete/${encodeURIComponent(providerName)}`, headers: { token: WHATSAPI_API_TOKEN } });
    }
  }
  for (const a of attempts) {
    try {
      const r = await fetch(a.url, { method: "DELETE", headers: a.headers });
      console.log("rollback provider delete", a.url, "status=", r.status);
      if (r.ok) return;
    } catch (e) { console.error("rollback provider delete failed", a.url, e); }
  }
}

async function createProviderInstance(tenant: any, slugSuffix: string, displayName: string): Promise<any> {
  const rawUrl = WHATSAPI_CREATE_URL.trim();
  if (!WHATSAPI_API_TOKEN || !rawUrl) {
    return { ok: false, status: 500, body: { error: "WHATSAPI_API_TOKEN/WHATSAPI_CREATE_URL não configurados" } };
  }

  const fullSlug = `${tenant.slug}-${slugSuffix}`;

  // Detect endpoint flavor:
  //  - new: Supabase edge "create-instance-url" — body { token, name, deviceName }
  //  - legacy: UAZAPI "/instance/init" — header admintoken + body { name, systemName }
  const isCreateUrlEndpoint = /\/create-instance-url(\/?$|\?)/.test(rawUrl) || rawUrl.endsWith("/create-instance-url");

  let createUrl: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (isCreateUrlEndpoint) {
    createUrl = rawUrl;
    headers = { "Content-Type": "application/json" };
    body = { token: WHATSAPI_API_TOKEN, name: fullSlug, deviceName: displayName };
  } else {
    // UAZAPI base URL or full endpoint
    const base = rawUrl.replace(/\/$/, "").replace(/\/instance\/(init|create).*$/, "");
    createUrl = `${base}/instance/init`;
    headers = {
      "Content-Type": "application/json",
      admintoken: WHATSAPI_API_TOKEN,
      Authorization: `Bearer ${WHATSAPI_API_TOKEN}`,
    };
    body = { name: fullSlug, systemName: displayName };
  }

  const createResp = await fetch(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const { text, data } = await parseProviderResponse(createResp);
  console.log("provider create response:", createResp.status, JSON.stringify(data).slice(0, 800));

  if (!createResp.ok) {
    console.error("provider create failed", createResp.status, createUrl, text);
    await deleteProviderInstance(null, null, fullSlug);
    return { ok: false, status: 502, body: { error: "Falha ao criar instância no provedor", details: data, endpoint: createUrl } };
  }

  const details = { ...getProviderDetails(data, tenant) };
  if (!details.server_url || !details.instance_token) {
    console.error("missing server_url/token from provider", { server_url: details.server_url, has_token: !!details.instance_token });
    await deleteProviderInstance(details.server_url, details.instance_token, details.instance_name ?? fullSlug);
    return { ok: false, status: 502, body: { error: "Provedor não retornou server_url/token", details: data } };
  }
  details.provider_instance_name = details.instance_name;
  details.instance_name = displayName;
  (details as any)._provider_technical_name = details.provider_instance_name ?? fullSlug;

  return { ok: true, details };
}

async function ensureProviderInstance(admin: any, tenantId: string, tenant: any, instance: any, webhookUrl: (secret: string) => string, displayName?: string, sellerInfo?: { seller_user_id?: string | null; seller_name?: string | null; seller_phone?: string | null }): Promise<any> {
  const name = displayName || instance?.instance_name || "Principal";
  const slugSuffix = (instance?.id ?? crypto.randomUUID()).toString().slice(0, 8);
  const created = await createProviderInstance(tenant, slugSuffix, name);
  if (!created.ok) return created;

  const payload = {
    tenant_id: tenantId,
    instance_name: name,
    server_url: created.details.server_url,
    instance_token: created.details.instance_token,
    status: "connecting",
    is_connected: false,
    qr_code: null,
    ...(sellerInfo?.seller_user_id !== undefined ? { seller_user_id: sellerInfo.seller_user_id } : {}),
    ...(sellerInfo?.seller_name !== undefined ? { seller_name: sellerInfo.seller_name } : {}),
    ...(sellerInfo?.seller_phone !== undefined ? { seller_phone: sellerInfo.seller_phone } : {}),
  };

  const query = instance?.id
    ? admin.from("whatsapp_instances").update(payload).eq("id", instance.id)
    : admin.from("whatsapp_instances").insert(payload);
  const { data: saved, error } = await query.select("*").single();
  if (error) {
    // DB save failed → rollback the orphaned provider instance.
    await deleteProviderInstance(created.details.server_url, created.details.instance_token, (created.details as any)._provider_technical_name);
    return { ok: false, status: 500, body: { error: error.message } };
  }

  try {
    await fetch(`${created.details.server_url}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: created.details.instance_token },
      body: JSON.stringify({
        url: webhookUrl(saved.webhook_secret),
        enabled: true,
        events: ["messages"],
        excludeMessages: ["wasSentByApi", "isGroupYes"],
      }),
    });
  } catch (e) { console.error("webhook register failed", e); }

  return { ok: true, instance: saved };
}

async function registerWebhook(instance: any, webhookUrl: (secret: string) => string): Promise<boolean> {
  if (!instance?.server_url || !instance?.instance_token || !instance?.webhook_secret) return false;
  try {
    const r = await fetch(`${instance.server_url}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instance.instance_token },
      body: JSON.stringify({
        url: webhookUrl(instance.webhook_secret),
        enabled: true,
        events: ["messages"],
        excludeMessages: ["wasSentByApi", "isGroupYes"],
      }),
    });
    console.log("webhook (re)registered status=", r.status);
    return r.ok;
  } catch (e) {
    console.error("registerWebhook failed", e);
    return false;
  }
}

function normalizePhone(jidOrPhone: string): string | null {
  if (!jidOrPhone) return null;
  const raw = jidOrPhone.toString();
  if (raw.endsWith("@g.us")) return null; // skip groups
  if (raw.endsWith("@lid")) return null; // skip linked-id pseudo numbers
  const digits = raw.split("@")[0].replace(/[^0-9]/g, "");
  if (!digits || digits.length < 8) return null; // skip invalid/short ids
  return digits;
}

// Variants to match BR mobile numbers regardless of leading 9 after DDD
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const set = new Set<string>();
  if (!digits) return [];
  set.add(digits);
  set.add(`+${digits}`);
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    const w = digits.slice(0, 4) + digits.slice(5);
    set.add(w); set.add(`+${w}`);
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const w = digits.slice(0, 4) + "9" + digits.slice(4);
    set.add(w); set.add(`+${w}`);
  }
  return [...set];
}

// Returns the canonical BR phone (digits with +, mobile 9-prefix when applicable)
function canonicalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let d = digits;
  if (d.length === 12 && d.startsWith("55")) {
    d = d.slice(0, 4) + "9" + d.slice(4);
  } else if (d.length === 11 && d[2] === "9") {
    d = "55" + d;
  }
  return `+${d}`;
}

function pickArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.chats)) return d.chats;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.data?.chats)) return d.data.chats;
  if (Array.isArray(d?.data?.messages)) return d.data.messages;
  if (Array.isArray(d?.data?.items)) return d.data.items;
  if (Array.isArray(d?.data?.results)) return d.data.results;
  if (Array.isArray(d?.messages)) return d.messages;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.response)) return d.response;
  if (Array.isArray(d?.response?.chats)) return d.response.chats;
  if (Array.isArray(d?.response?.messages)) return d.response.messages;
  if (Array.isArray(d?.response?.items)) return d.response.items;
  if (Array.isArray(d?.result?.chats)) return d.result.chats;
  if (Array.isArray(d?.result?.messages)) return d.result.messages;
  if (Array.isArray(d?.result?.items)) return d.result.items;
  return [];
}

function extractMsgText(m: any): string | null {
  const content = m?.content;
  if (typeof content === "string") return content;
  return (
    m?.text ?? m?.body ?? m?.content ?? m?.caption ??
    m?.message?.content ??
    m?.message?.conversation ??
    m?.message?.extendedTextMessage?.text ??
    m?.message?.imageMessage?.caption ??
    m?.message?.videoMessage?.caption ??
    m?.message?.documentMessage?.caption ??
    m?.messageText ?? null
  );
}

function pickFirstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = pickFirstString(value.url, value.href, value.image, value.preview, value.base64, value.jpegThumbnail);
      if (nested) return nested;
    }
  }
  return null;
}

function normalizeAvatar(value: any): string | null {
  const raw = pickFirstString(value);
  if (!raw) return null;
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const compact = raw.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length > 80) {
    return `data:image/jpeg;base64,${compact}`;
  }
  return null;
}

async function resolveAvatar(instance: any, chat: any, chatId: string, phone: string): Promise<string | null> {
  const direct = normalizeAvatar(pickFirstString(
    chat?.image, chat?.imagePreview, chat?.profilePicUrl, chat?.profilePictureUrl, chat?.profilePicture,
    chat?.picture, chat?.photo, chat?.avatar, chat?.thumb, chat?.thumbnail, chat?.contact?.imgUrl,
    chat?.contact?.profilePicUrl, chat?.contact?.picture, chat?.contact?.avatar
  ));
  if (direct?.startsWith("data:image/")) return direct;
  if (direct && /^https?:\/\//i.test(direct)) {
    const embedded = await fetchAvatarAsDataUrl(direct, instance.instance_token);
    if (embedded) return embedded;
  }

  const endpoints = [
    { url: `${instance.server_url}/contact/profilePicture`, body: { chatid: chatId, number: phone } },
    { url: `${instance.server_url}/contact/profile-picture`, body: { chatid: chatId, number: phone } },
    { url: `${instance.server_url}/chat/profilePicture`, body: { chatid: chatId, number: phone } },
    { url: `${instance.server_url}/profile/picture`, body: { chatid: chatId, number: phone } },
  ];

  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: JSON.stringify(ep.body),
      });
      if (!r.ok) continue;
      const contentType = r.headers.get("content-type") ?? "";
      if (contentType.startsWith("image/")) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        return `data:${contentType};base64,${btoa(binary)}`;
      }
      const { data } = await parseProviderResponse(r);
      const picked = normalizeAvatar(pickFirstString(
        data,
        data?.url, data?.image, data?.imageUrl, data?.profilePicUrl, data?.profilePictureUrl,
        data?.picture, data?.photo, data?.avatar, data?.base64, data?.data?.url,
        data?.data, data?.data?.image, data?.data?.profilePicUrl, data?.response,
        data?.response?.url, data?.response?.image
      ));
      if (picked) return picked;
    } catch (e) { console.error("resolveAvatar endpoint failed", ep.url, e); }
  }

  return direct;
}

async function fetchAvatarAsDataUrl(url: string, token?: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: token ? { token } : undefined });
    const type = r.headers.get("content-type") ?? "";
    const length = Number(r.headers.get("content-length") ?? 0);
    if (!r.ok || !type.startsWith("image/") || length > 1_500_000) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > 1_500_000) return null;
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:${type};base64,${btoa(binary)}`;
  } catch (e) {
    console.error("fetchAvatarAsDataUrl failed", e);
    return null;
  }
}

function shouldReplaceAvatar(current: string | null | undefined, next: string | null): boolean {
  if (!next) return false;
  if (!current) return true;
  if (!current.startsWith("data:image/") && next.startsWith("data:image/")) return true;
  return current !== next;
}

async function fetchChats(instance: any): Promise<any[]> {
  const tryEndpoints = [
    { url: `${instance.server_url}/chat/find`, method: "POST", body: { operator: "AND", sort: "-wa_lastMsgTimestamp" } },
    { url: `${instance.server_url}/chat/find`, method: "POST", body: {} },
    { url: `${instance.server_url}/chats`, method: "GET" },
  ];
  for (const ep of tryEndpoints) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: ep.method === "POST" ? JSON.stringify(ep.body ?? {}) : undefined,
      });
      if (!r.ok) continue;
      const { data } = await parseProviderResponse(r);
      const arr = pickArray(data);
      if (arr.length) return arr;
    } catch (e) { console.error("fetchChats endpoint failed", ep.url, e); }
  }
  return [];
}

async function fetchMessages(instance: any, chatId: string, limit = 50): Promise<any[]> {
  const tryEndpoints = [
    { url: `${instance.server_url}/message/find`, method: "POST", body: { chatId, limit } },
    { url: `${instance.server_url}/message/find`, method: "POST", body: { chatId, limit, cursor: "" } },
    { url: `${instance.server_url}/message/find`, method: "POST", body: { chatid: chatId, limit } },
    { url: `${instance.server_url}/message/find`, method: "POST", body: { where: { key: { remoteJid: chatId } }, page: 1, offset: limit } },
    { url: `${instance.server_url}/chat/messages`, method: "POST", body: { chatid: chatId, limit } },
  ];
  for (const ep of tryEndpoints) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: ep.method === "POST" ? JSON.stringify(ep.body) : undefined,
      });
      if (!r.ok) continue;
      const { data } = await parseProviderResponse(r);
      const arr = pickArray(data);
      if (arr.length) return arr;
    } catch (e) { console.error("fetchMessages endpoint failed", ep.url, e); }
  }
  return [];
}

function tsToIso(ts: any): string | null {
  if (!ts) return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

function classifyByKeywords(text: string | null | undefined): { temperature: "hot"|"warm"|"cold"; stage?: "novo"|"qualificado"|"agendado" } {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return { temperature: "cold" };
  const hot = /(agendar|marcar|hoje|agora|urgent|urge|quebr|perdi|preciso|disponível|disponivel|que horas|amanhã|amanha|encaixe|encaix)/;
  const warm = /(preço|preco|valor|quanto|orçamento|orcamento|convênio|convenio|plano|aceita|tem|disponíveis|grau|lente|armação|armacao|óculos|oculos|consulta|exame)/;
  if (hot.test(t)) {
    const stage = /(agendar|marcar|que horas|amanhã|amanha|encaixe|encaix)/.test(t) ? "qualificado" : "qualificado";
    return { temperature: "hot", stage };
  }
  if (warm.test(t)) return { temperature: "warm", stage: "qualificado" };
  return { temperature: "cold" };
}

async function syncHistory(admin: any, tenantId: string, instance: any, maxChats = 200, msgsPerChat = 30) {
  if (!instance?.server_url || !instance?.instance_token) {
    return { ok: false, error: "instância sem credenciais" };
  }
  // Cleanup: remove previously imported leads with bad/short phone numbers and no messages
  try {
    const { data: bad } = await admin
      .from("leads")
      .select("id, phone")
      .eq("tenant_id", tenantId)
      .eq("source", "WhatsApp");
    const badIds = (bad ?? [])
      .filter((l: any) => !l.phone || l.phone.replace(/[^0-9]/g, "").length < 10)
      .map((l: any) => l.id);
    if (badIds.length) {
      const { data: convs } = await admin.from("conversations").select("id").in("lead_id", badIds);
      const convIds = (convs ?? []).map((c: any) => c.id);
      if (convIds.length) {
        await admin.from("messages").delete().in("conversation_id", convIds);
        await admin.from("conversations").delete().in("id", convIds);
      }
      await admin.from("leads").delete().in("id", badIds);
      console.log("syncHistory: cleaned bad leads =", badIds.length);
    }
  } catch (e) { console.error("cleanup failed", e); }

  const chats = await fetchChats(instance);
  console.log("syncHistory: chats found =", chats.length);
  let importedChats = 0, importedMsgs = 0, skipped = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const c of chats.slice(0, maxChats)) {
    // Pequena pausa para não martelar o provedor sem estourar o tempo da Edge Function.
    await sleep(40 + Math.floor(Math.random() * 60));
    if (c?.wa_isGroup === true) { skipped++; continue; }
    const chatJid: string = c?.wa_chatid ?? c?.chatid ?? c?.jid ?? c?.remoteJid ?? "";
    // Prefer the explicit phone field from uazapi (real number), then fall back to JID
    const phoneRaw: string = c?.phone ?? chatJid ?? "";
    const phone = normalizePhone(phoneRaw);
    if (!phone) { skipped++; continue; }
    const name: string =
      c?.wa_name || c?.wa_contactName || c?.lead_fullName || c?.lead_name || c?.name || c?.pushname || phone;
    const avatar = await resolveAvatar(instance, c, chatJid, phone);
    const lastPreview: string | null = c?.wa_lastMessageTextVote ?? c?.lastMessage?.text ?? null;
    const lastAt: string | null = tsToIso(c?.wa_lastMsgTimestamp ?? c?.lastMessage?.timestamp);

    // upsert lead by phone (match BR mobile w/ or w/o the 9-prefix, always store canonical)
    const variants = phoneVariants(phone);
    const canonical = canonicalPhone(phone);
    let { data: lead } = await admin
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("phone", variants)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const cls = classifyByKeywords(lastPreview);
    if (!lead) {
      const { data: created, error: createLeadError } = await admin.from("leads").insert({
        tenant_id: tenantId, phone: canonical, name, source: "WhatsApp",
        whatsapp_instance_id: instance.id,
        last_message_at: lastAt ?? new Date().toISOString(),
        temperature: cls.temperature,
        stage: "historico",
        metadata: { imported_from_history: true, ...(avatar ? { whatsapp_avatar_url: avatar } : {}) },
      }).select("*").single();
      if (createLeadError) console.error("insert lead failed", createLeadError.message, { phone: canonical, name });
      lead = created;
    } else {
      const patch: Record<string, any> = {};
      if (lead.phone !== canonical) patch.phone = canonical;
      if ((!lead.name || lead.name === lead.phone) && name && name !== phone) patch.name = name;
      if (!lead.whatsapp_instance_id) patch.whatsapp_instance_id = instance.id;
      if (lastAt) patch.last_message_at = lastAt;
      // Only refresh classification if lead is still in initial state
      if ((lead.stage ?? "novo") === "novo" && cls.stage) patch.stage = cls.stage;
      if ((lead.temperature ?? "warm") === "warm" && cls.temperature !== "warm") patch.temperature = cls.temperature;
      // Garante sinalizador de importação histórica
      const meta = (lead.metadata ?? {}) as Record<string, any>;
      const metadataPatch = { ...meta, imported_from_history: true, ...(avatar && shouldReplaceAvatar(meta.whatsapp_avatar_url, avatar) ? { whatsapp_avatar_url: avatar } : {}) };
      if (JSON.stringify(metadataPatch) !== JSON.stringify(meta)) patch.metadata = metadataPatch;
      if (Object.keys(patch).length) {
        const { data: upd, error: updateLeadError } = await admin.from("leads").update(patch).eq("id", lead.id).select("*").single();
        if (updateLeadError) console.error("update lead failed", updateLeadError.message, { lead_id: lead.id });
        if (upd) lead = upd;
      }
    }
    if (!lead) continue;

    // upsert conversation
    let { data: conv } = await admin.from("conversations").select("*").eq("lead_id", lead.id).maybeSingle();
    if (!conv) {
      const { data: createdConv, error: createConvError } = await admin.from("conversations").insert({
        tenant_id: tenantId, lead_id: lead.id, whatsapp_instance_id: instance.id,
        last_message_preview: lastPreview?.slice(0, 120) ?? null,
        last_message_at: lastAt,
        metadata: { imported_from_history: true },
      }).select("*").single();
      if (createConvError) console.error("insert conversation failed", createConvError.message, { lead_id: lead.id });
      conv = createdConv;
    } else if (!conv.whatsapp_instance_id) {
      const { data: updatedConv, error: updateConvError } = await admin.from("conversations").update({ whatsapp_instance_id: instance.id }).eq("id", conv.id).select("*").single();
      if (updateConvError) console.error("update conversation instance failed", updateConvError.message, { conversation_id: conv.id });
      if (updatedConv) conv = updatedConv;
    }
    if (!conv) continue;
    importedChats++;

    // fetch messages — use the wa_chatid from uazapi
    const msgs = await fetchMessages(instance, chatJid, msgsPerChat);
    if (!msgs.length) {
      // still update conversation preview even without messages
      if (lastPreview || lastAt) {
        await admin.from("conversations").update({
          last_message_preview: lastPreview?.slice(0, 120) ?? conv.last_message_preview,
          last_message_at: lastAt ?? conv.last_message_at,
        }).eq("id", conv.id);
      }
      continue;
    }

    // existing external_ids to skip duplicates, scoped by tenant because imported
    // WhatsApp/provider IDs are globally stable for the connected account.
    const candidateIds = msgs
      .map((m: any) => m?.messageid ?? m?.messageId ?? m?.id ?? m?.key?.id ?? null)
      .filter((id: any) => typeof id === "string" && id.trim());
    const { data: existing } = candidateIds.length
      ? await admin.from("messages").select("external_id").eq("tenant_id", tenantId).in("external_id", candidateIds)
      : { data: [] } as any;
    const existingIds = new Set((existing ?? []).map((m: any) => m.external_id));
    const seenInBatch = new Set<string>();

    const rows: any[] = [];
    for (const m of msgs) {
      const text = extractMsgText(m);
      if (!text) continue;
      const extId = m?.messageid ?? m?.messageId ?? m?.id ?? m?.key?.id ?? null;
      if (extId && existingIds.has(extId)) continue;
      const fromMe = m?.fromMe === true || m?.key?.fromMe === true || m?.from_me === true;
      const created_at = tsToIso(m?.messageTimestamp ?? m?.timestamp ?? m?.t) ?? new Date().toISOString();
      const createdBucket = Math.floor(new Date(created_at).getTime() / 10_000);
      const signature = extId
        ? `id:${extId}`
        : `near:${fromMe ? "out" : "in"}:${createdBucket}:${text}`;
      if (seenInBatch.has(signature)) continue;
      seenInBatch.add(signature);
      rows.push({
        tenant_id: tenantId,
        conversation_id: conv.id,
        lead_id: lead.id,
        whatsapp_instance_id: instance.id,
        direction: fromMe ? "outbound" : "inbound",
        body: text,
        external_id: extId,
        created_at,
      });
    }
    // Sort messages chronologically (uazapi returns newest first when sorted)
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (rows.length) {
      const { error } = await admin.from("messages").insert(rows);
      if (error) console.error("insert messages failed", error.message);
      else importedMsgs += rows.length;

      // update conversation preview
      const last = rows[rows.length - 1];
      await admin.from("conversations").update({
        last_message_preview: last.body.slice(0, 120),
        last_message_at: last.created_at,
      }).eq("id", conv.id);
    }
  }
  return { ok: true, chats: importedChats, messages: importedMsgs, skipped, total_chats: chats.length };
}

async function autoSyncHistoryOnce(admin: any, tenantId: string, instance: any, reason: string) {
  if (!instance?.id || !(instance.is_connected || instance.status === "connected")) return null;
  const metadata = (instance.metadata ?? {}) as Record<string, any>;
  if (metadata.history_sync_started_at || metadata.history_sync_completed_at) return null;

  const startedAt = new Date().toISOString();
  await admin.from("whatsapp_instances").update({
    metadata: { ...metadata, history_sync_started_at: startedAt, history_sync_reason: reason },
  }).eq("id", instance.id);

  const result = await syncHistory(admin, tenantId, instance, 80, 20);
  await admin.from("whatsapp_instances").update({
    metadata: {
      ...metadata,
      history_sync_started_at: startedAt,
      history_sync_completed_at: new Date().toISOString(),
      history_sync_reason: reason,
      history_sync_result: result,
    },
  }).eq("id", instance.id);
  return result;
}

async function syncProviderStatus(admin: any, instance: any): Promise<{ instance: any; connected: boolean }> {
  if (!instance?.server_url || !instance?.instance_token) return { instance, connected: !!instance?.is_connected };
  try {
    const r = await fetch(`${instance.server_url}/instance/status`, {
      method: "GET",
      headers: { token: instance.instance_token },
    });
    const { text: txt, data: d } = await parseProviderResponse(r);
    if (isAuthProviderError(r, d, txt)) {
      const { data: upd } = await admin.from("whatsapp_instances").update({ is_connected: false, status: "connecting", qr_code: null }).eq("id", instance.id).select("*").single();
      return { instance: upd ?? { ...instance, is_connected: false, status: "connecting", qr_code: null }, connected: false };
    }
    const currentQrCode = extractQrCode(d);
    let connected = !currentQrCode && isConnectedSignal(d);
    let inst = d.instance ?? d;
    if (!connected && isDisconnectedSignal(d)) {
      const verify = await fetch(`${instance.server_url}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: JSON.stringify({}),
      });
      const verified = await parseProviderResponse(verify);
      const verifiedQrCode = extractQrCode(verified.data);
      if (verifiedQrCode) {
        const { data: upd } = await admin.from("whatsapp_instances").update({
          is_connected: false,
          status: "connecting",
          qr_code: verifiedQrCode,
        }).eq("id", instance.id).select("*").single();
        return { instance: upd ?? { ...instance, is_connected: false, status: "connecting", qr_code: verifiedQrCode }, connected: false };
      }
      if (isConnectedSignal(verified.data)) {
        connected = true;
        inst = verified.data.instance ?? verified.data;
      }
    }
    const phone = inst?.user?.id?.split?.("@")[0] ?? inst?.owner ?? inst?.phone ?? null;
    const phoneChanged = !!phone && phone !== instance.phone_number;
    if (connected && (!instance.is_connected || instance.status !== "connected" || (phone && !instance.phone_number) || phoneChanged)) {
      const { data: upd } = await admin.from("whatsapp_instances").update({
        is_connected: true, status: "connected",
        last_connection_at: phoneChanged ? new Date().toISOString() : (instance.last_connection_at ?? new Date().toISOString()),
        qr_code: null,
        phone_number: phone ?? instance.phone_number,
      }).eq("id", instance.id).select("*").single();
      return { instance: upd ?? instance, connected: true };
    }
    if (!connected && instance.is_connected && isDisconnectedSignal(d)) {
      const { data: upd } = await admin.from("whatsapp_instances").update({ is_connected: false, status: "disconnected" }).eq("id", instance.id).select("*").single();
      return { instance: upd ?? instance, connected: false };
    }
    return { instance, connected: connected || !!instance?.is_connected };
  } catch (e) {
    console.error("provider status sync failed", e);
    return { instance, connected: !!instance?.is_connected };
  }
}

function roleCanManageWhatsapp(role?: string | null): boolean {
  return role === "owner" || role === "supervisor";
}

function safeDisplayName(value: unknown, fallback: string): string {
  const raw = (value ?? "").toString().trim();
  return (raw || fallback).slice(0, 60);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Identify caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Resolve tenant — prefer tenant_memberships because invited users may not have profiles.tenant_id updated.
    let { data: profile } = await admin.from("profiles").select("tenant_id, display_name, full_name, email").eq("id", userId).maybeSingle();
    let { data: roles } = await admin.from("user_roles").select("role,tenant_id").eq("user_id", userId);
    const isSuper = (roles ?? []).some((r: any) => r.role === "superadmin");

    const body = await req.json().catch(() => ({}));
    const { action } = body ?? {};
    const requestedTenantId: string | null = body?.tenant_id ?? null;
    let { data: membership } = await admin
      .from("tenant_memberships")
      .select("tenant_id, role, display_name")
      .eq("user_id", userId)
      .eq("tenant_id", requestedTenantId || profile?.tenant_id || "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (!membership) {
      const { data: firstMembership } = await admin
        .from("tenant_memberships")
        .select("tenant_id, role, display_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      membership = firstMembership;
    }

    let tenantId: string | null = requestedTenantId ?? membership?.tenant_id ?? profile?.tenant_id ?? null;

    // Auto-recovery: usuário autenticado sem tenant (cadastro órfão) → cria loja padrão
    if (!tenantId && !isSuper) {
      const email = userData.user.email ?? "";
      const meta: any = userData.user.user_metadata ?? {};
      const fullName = (meta.full_name || meta.name || email.split("@")[0] || "Minha ótica").toString().slice(0, 80);
      const slug = `loja-${crypto.randomUUID().slice(0, 8)}`;
      const { data: newTenant, error: tErr } = await admin
        .from("tenants")
        .insert({ name: fullName, slug, plan: "starter", status: "active" })
        .select("id")
        .single();
      if (tErr || !newTenant) {
        console.error("auto-recovery tenant create failed", tErr);
        return json({ error: "Não foi possível inicializar sua loja." }, 500);
      }
      tenantId = newTenant.id as string;
      await admin.from("profiles").upsert({ id: userId, tenant_id: tenantId, email, full_name: fullName });
      await admin.from("user_roles").insert({ user_id: userId, role: "owner", tenant_id: tenantId });
      await admin.from("ai_config").insert({ tenant_id: tenantId }).then(() => {}, () => {});
      profile = { tenant_id: tenantId, display_name: fullName, full_name: fullName, email } as any;
      membership = { tenant_id: tenantId, role: "owner", display_name: fullName } as any;
      console.log("auto-recovery: created tenant for orphan user", userId, tenantId);
    }

    if (!tenantId) return json({ error: "tenant não encontrado" }, 400);
    const belongsToTenant = membership?.tenant_id === tenantId || profile?.tenant_id === tenantId;
    if (!isSuper && !belongsToTenant) {
      return json({ error: "forbidden" }, 403);
    }

    if (!isSuper && membership?.tenant_id === tenantId && profile?.tenant_id !== tenantId) {
      await admin.from("profiles").update({ tenant_id: tenantId }).eq("id", userId);
      profile = { ...(profile ?? {}), tenant_id: tenantId } as any;
    }

    // Load tenant for naming
    const { data: tenant } = await admin.from("tenants").select("id,name,slug").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ error: "tenant inválido" }, 400);

    const webhookUrl = (secret: string) =>
      `${SUPABASE_URL}/functions/v1/whatsapp-webhook?secret=${secret}`;

    const requestedInstanceId: string | null = body?.instance_id ?? null;
    const callerRole = (membership?.role ?? (isSuper ? "superadmin" : null)) as string | null;
    const callerCanManageAllInstances = isSuper || roleCanManageWhatsapp(callerRole);
    const callerName = safeDisplayName(membership?.display_name ?? profile?.display_name ?? profile?.full_name ?? profile?.email ?? userData.user.email, "Meu WhatsApp");

    // Helper: load a specific instance OR the most recent one for this tenant
    async function loadInstance(): Promise<any> {
      if (requestedInstanceId) {
        const query = admin
          .from("whatsapp_instances")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("id", requestedInstanceId);
        if (!callerCanManageAllInstances) query.eq("seller_user_id", userId);
        const { data } = await query.maybeSingle();
        return data;
      }
      const query = admin
        .from("whatsapp_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (!callerCanManageAllInstances) query.eq("seller_user_id", userId);
      const { data } = await query.maybeSingle();
      return data;
    }

    // ─── Multi-instance actions (don't need a single "current" instance) ───
    if (action === "list") {
      const query = admin
        .from("whatsapp_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (!callerCanManageAllInstances) query.eq("seller_user_id", userId);
      const { data } = await query;
      const list = data ?? [];
      return json({
        instances: list.map(sanitize),
        free_limit: 3,
        used: list.length,
        next_is_paid: list.length >= 3,
      });
    }

    if (action === "create") {
      const sellerUserId: string | null = body?.seller_user_id ?? null;
      const sellerNameRaw: string = (body?.seller_name ?? "").toString().trim();
      const sellerPhoneRaw: string = (body?.seller_phone ?? "").toString().trim();
      const sellerPhone = sellerPhoneRaw ? sellerPhoneRaw.replace(/[^0-9]/g, "") : "";

      // Idempotência: se este consultor já tem instância no tenant, devolve a existente
      if (sellerUserId) {
        const { data: existing } = await admin
          .from("whatsapp_instances")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("seller_user_id", sellerUserId)
          .maybeSingle();
        if (existing) return json({ instance: sanitize(existing), is_paid: false, reused: true });
      }

      const rawName = ((body?.name ?? sellerNameRaw) ?? "").toString().trim();
      if (!rawName || rawName.length < 2) return json({ error: "Nome do número é obrigatório (mín. 2 caracteres)." }, 400);
      const displayName = rawName.slice(0, 60);
      // Avoid duplicate names within the tenant
      const { data: dup } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("instance_name", displayName)
        .maybeSingle();
      if (dup) return json({ error: "Já existe um número com esse nome." }, 409);

      // Limite gratuito: até 3 instâncias por loja. A partir da 4ª exige confirmação explícita.
      // Consultor (seller_user_id presente) é sempre tratado como gratuito.
      const { count: existingCount } = await admin
        .from("whatsapp_instances")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      const FREE_LIMIT = 3;
      const willBePaid = !sellerUserId && (existingCount ?? 0) >= FREE_LIMIT;
      if (willBePaid && body?.confirm_extra !== true) {
        return json({
          error: "extra_confirmation_required",
          message: "Você já tem 3 números gratuitos. Adicionar mais terá custo adicional.",
          free_limit: FREE_LIMIT,
          used: existingCount ?? 0,
        }, 402);
      }

      // Resolve seller via tenant_memberships (profiles.tenant_id pode estar vazio em novos usuários)
      let resolvedSellerName: string | null = sellerNameRaw || null;
      let resolvedSellerPhone: string | null = sellerPhone || null;
      if (sellerUserId) {
        const { data: membership } = await admin
          .from("tenant_memberships")
          .select("tenant_id, display_name")
          .eq("user_id", sellerUserId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (!membership) return json({ error: "Vendedor não pertence a esta loja." }, 400);
        if (!resolvedSellerName) {
          const { data: prof } = await admin
            .from("profiles")
            .select("full_name, display_name, email")
            .eq("id", sellerUserId)
            .maybeSingle();
          resolvedSellerName = membership.display_name ?? prof?.display_name ?? prof?.full_name ?? prof?.email ?? null;
        }
      }

      const ensured = await ensureProviderInstance(admin, tenantId, tenant, null, webhookUrl, displayName, {
        seller_user_id: sellerUserId,
        seller_name: resolvedSellerName,
        seller_phone: resolvedSellerPhone,
      });
      if (!ensured.ok) return json(ensured.body, ensured.status);

      // Cobrança: só registra/avisa quando ultrapassa o limite gratuito.
      // O trigger SQL cria sempre o registro; cancelamos os gratuitos para o financeiro ficar correto.
      try {
        if (!willBePaid) {
          await admin
            .from("instance_charges")
            .update({ status: "canceled", amount: 0 })
            .eq("whatsapp_instance_id", ensured.instance.id);
        }

        if (willBePaid && resolvedSellerPhone && resolvedSellerPhone.length >= 10) {
          // Send via the first connected instance of the tenant (any number works as sender)
          const { data: senderInstance } = await admin
            .from("whatsapp_instances")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("is_connected", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (senderInstance?.server_url && senderInstance?.instance_token) {
            const msg = `Olá${resolvedSellerName ? ` ${resolvedSellerName.split(" ")[0]}` : ""}! Um novo número de WhatsApp foi adicionado em *${tenant.name}* (${displayName}) sob sua responsabilidade. ⚠️ Este número ultrapassa o limite gratuito de 3 e terá *custo adicional* na próxima fatura.`;
            await randomSendDelay();
            await fetch(`${senderInstance.server_url}/send/text`, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: senderInstance.instance_token },
              body: JSON.stringify({ number: resolvedSellerPhone, text: msg }),
            }).catch((e) => console.error("seller notify send failed", e));
            await admin
              .from("instance_charges")
              .update({ notified_at: new Date().toISOString() })
              .eq("whatsapp_instance_id", ensured.instance.id);
          } else {
            console.log("no connected sender instance to notify seller");
          }
        }
      } catch (e) {
        console.error("seller notification flow failed", e);
      }

      return json({ instance: sanitize(ensured.instance), is_paid: willBePaid });
    }

    if (action === "adopt") {
      const rawName = (body?.name ?? "").toString().trim();
      const serverUrl = (body?.server_url ?? "").toString().trim().replace(/\/+$/, "");
      const instanceToken = (body?.instance_token ?? "").toString().trim();
      if (!rawName || rawName.length < 2) return json({ error: "Nome do número é obrigatório (mín. 2 caracteres)." }, 400);
      if (!/^https?:\/\//i.test(serverUrl)) return json({ error: "Server URL inválida." }, 400);
      if (instanceToken.length < 10) return json({ error: "Token da instância inválido." }, 400);
      const displayName = rawName.slice(0, 60);

      const { data: dup } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(`instance_token.eq.${instanceToken},instance_name.ilike.${displayName}`)
        .maybeSingle();
      if (dup) return json({ error: "Já existe um número com esse nome ou token nesta loja." }, 409);

      // Validate token by querying provider status
      let providerStatus: any = null;
      try {
        const r = await fetch(`${serverUrl}/instance/status`, {
          method: "GET",
          headers: { token: instanceToken },
        });
        if (isAuthProviderError(r, null, "")) {
          return json({ error: "Token rejeitado pelo provedor. Verifique o Token da Instância." }, 400);
        }
        const parsed = await parseProviderResponse(r);
        providerStatus = parsed.data;
      } catch (e) {
        console.error("adopt: status check failed", e);
        return json({ error: "Não foi possível validar com o provedor (server_url inacessível)." }, 502);
      }

      const sellerUserId: string | null = body?.seller_user_id ?? null;
      const sellerNameRaw: string = (body?.seller_name ?? "").toString().trim();
      const sellerPhoneRaw: string = (body?.seller_phone ?? "").toString().trim();
      const sellerPhone = sellerPhoneRaw ? sellerPhoneRaw.replace(/[^0-9]/g, "") : "";
      let resolvedSellerName: string | null = sellerNameRaw || null;
      const resolvedSellerPhone: string | null = sellerPhone || null;
      if (sellerUserId) {
        const { data: prof } = await admin
          .from("profiles")
          .select("full_name, email, tenant_id")
          .eq("id", sellerUserId)
          .maybeSingle();
        if (!prof || prof.tenant_id !== tenantId) {
          return json({ error: "Vendedor inválido." }, 400);
        }
        if (!resolvedSellerName) resolvedSellerName = prof.full_name ?? prof.email ?? null;
      }

      const connected = isConnectedSignal(providerStatus);
      const inst = providerStatus?.instance ?? providerStatus ?? {};
      const phone = inst?.user?.id?.split?.("@")[0] ?? inst?.owner ?? inst?.phone ?? null;

      const { data: saved, error } = await admin
        .from("whatsapp_instances")
        .insert({
          tenant_id: tenantId,
          instance_name: displayName,
          server_url: serverUrl,
          instance_token: instanceToken,
          status: connected ? "connected" : "connecting",
          is_connected: connected,
          phone_number: phone,
          last_connection_at: connected ? new Date().toISOString() : null,
          seller_user_id: sellerUserId,
          seller_name: resolvedSellerName,
          seller_phone: resolvedSellerPhone,
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 500);

      // Register webhook on provider so inbound messages flow to us
      await registerWebhook(saved, webhookUrl);

      // Reintegração não cobra: marca cobrança auto criada como cancelada
      try {
        await admin
          .from("instance_charges")
          .update({ status: "canceled", amount: 0 })
          .eq("whatsapp_instance_id", saved.id);
      } catch (e) { console.error("adopt: cancel charge failed", e); }

      return json({ instance: sanitize(saved), connected });
    }

    // ─── Vendedores compartilhando o número principal ───
    async function getPrincipalInstance() {
      const { data } = await admin
        .from("whatsapp_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    }

    if (action === "list-sellers") {
      const principal = await getPrincipalInstance();
      if (!principal) return json({ sellers: [], principal: null });
      const { data, error } = await admin
        .from("whatsapp_sellers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("whatsapp_instance_id", principal.id)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ sellers: data ?? [], principal: sanitize(principal) });
    }

    if (action === "add-seller") {
      const principal = await getPrincipalInstance();
      if (!principal) return json({ error: "Conecte o número principal antes de cadastrar vendedores." }, 400);

      const name = (body?.name ?? "").toString().trim();
      if (name.length < 2) return json({ error: "Nome do vendedor é obrigatório." }, 400);
      const phoneRaw = (body?.phone ?? "").toString().trim();
      const phone = phoneRaw ? phoneRaw.replace(/[^0-9]/g, "") : null;
      if (phone && phone.length < 10) return json({ error: "Telefone inválido (use DDI+DDD+número)." }, 400);
      const userId: string | null = body?.user_id ?? null;
      const notify: boolean = body?.notify_on_new_lead !== false;

      let resolvedName = name;
      if (userId) {
        const { data: prof } = await admin
          .from("profiles")
          .select("full_name, email, tenant_id")
          .eq("id", userId)
          .maybeSingle();
        if (!prof || prof.tenant_id !== tenantId) return json({ error: "Usuário inválido." }, 400);
        if (!resolvedName) resolvedName = prof.full_name ?? prof.email ?? "Vendedor";
      }

      const { data: saved, error } = await admin
        .from("whatsapp_sellers")
        .insert({
          tenant_id: tenantId,
          whatsapp_instance_id: principal.id,
          user_id: userId,
          name: resolvedName.slice(0, 120),
          phone,
          notify_on_new_lead: notify,
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") return json({ error: "Esse telefone já está cadastrado." }, 409);
        return json({ error: error.message }, 500);
      }

      // Mensagem de boas-vindas para o vendedor (avisar que o número da loja é o canal único)
      if (phone && principal.server_url && principal.instance_token && principal.is_connected) {
        try {
          const firstName = resolvedName.split(" ")[0];
          const msg = `Olá ${firstName}! Você foi cadastrado(a) como vendedor(a) em *${tenant.name}*. Todas as conversas serão atendidas a partir do número principal da loja, e você será avisado por aqui quando houver novidades atribuídas a você.`;
          await randomSendDelay();
          await fetch(`${principal.server_url}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: principal.instance_token },
            body: JSON.stringify({ number: phone, text: msg }),
          }).catch((e) => console.error("seller welcome failed", e));
        } catch (e) { console.error("seller welcome flow failed", e); }
      }

      return json({ seller: saved });
    }

    if (action === "delete-seller") {
      const sellerId = (body?.seller_id ?? "").toString();
      if (!sellerId) return json({ error: "seller_id obrigatório" }, 400);
      const { error } = await admin
        .from("whatsapp_sellers")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", sellerId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    let instance = await hydrateLegacyCredentials(admin, await loadInstance());

    switch (action) {
      case "get-or-create": {
        if (!instance) {
          const ensured = await ensureProviderInstance(admin, tenantId, tenant, instance, webhookUrl, instance?.instance_name || "Principal");
          if (!ensured.ok) return json(ensured.body, ensured.status);
          instance = ensured.instance;
        }
        const synced = await syncProviderStatus(admin, instance);
        instance = synced.instance;
        if (synced.connected) await registerWebhook(instance, webhookUrl);
        return json({ instance: sanitize(instance) });
      }

      case "qrcode": {
        if (!instance) {
          return json({ error: "Instância não encontrada" }, 404);
        }
        if (hasBadCredentials(instance, tenant)) {
          const ensured = await ensureProviderInstance(admin, tenantId, tenant, instance, webhookUrl, instance?.instance_name || "Principal");
          if (!ensured.ok) return json(ensured.body, ensured.status);
          instance = ensured.instance;
        }
        if (!instance?.server_url || !instance.instance_token) {
          return json({ error: "Instância sem credenciais" }, 400);
        }
        const r = await fetch(`${instance.server_url}/instance/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: instance.instance_token },
        });
        let { text: txt, data: d } = await parseProviderResponse(r);
        if (isAuthProviderError(r, d, txt)) {
          console.error("provider rejected instance token on /instance/connect", txt);
          return json({
            error: "Token da instância foi recusado pelo provedor. Reintegre a instância informando o Token correto do painel UAZAPI.",
            details: d,
          }, 400);
        }
        console.log("qrcode response shape:", JSON.stringify(d).slice(0, 500));
        const qrcode = extractQrCode(d);
        const connected = !qrcode && isConnectedSignal(d);
        if (qrcode) {
          const { data: upd } = await admin.from("whatsapp_instances").update({
            is_connected: false,
            qr_code: qrcode,
            status: "connecting",
          }).eq("id", instance.id).select("*").single();
          instance = upd ?? { ...instance, is_connected: false, qr_code: qrcode, status: "connecting" };
        } else if (connected) {
          const inst = d.instance ?? d;
          const phone = inst?.user?.id?.split?.("@")[0] ?? inst?.owner ?? inst?.phone ?? null;
          const newPhone = phone ?? instance.phone_number;
          const phoneChanged = !!phone && phone !== instance.phone_number;
          const { data: upd } = await admin.from("whatsapp_instances").update({
            is_connected: true, status: "connected",
            last_connection_at: new Date().toISOString(),
            qr_code: null,
            phone_number: newPhone,
            ...(phoneChanged ? { seller_phone: phone } : {}),
          }).eq("id", instance.id).select("*").single();
          instance = upd ?? { ...instance, is_connected: true, status: "connected", qr_code: null, phone_number: newPhone };
          await registerWebhook(instance, webhookUrl);
          try {
            await autoSyncHistoryOnce(admin, tenantId, instance, "qrcode_connected");
          } catch (e) {
            console.error("auto sync-history after qrcode failed:", e);
          }
        }
        return json({ qrcode, connected, instance: sanitize(instance) });
      }

      case "status": {
        if (!instance) return json({ error: "Instância não encontrada" }, 404);
        const synced = await syncProviderStatus(admin, instance);
        instance = synced.instance;
        const connected = synced.connected;
        if (connected) {
          // Best-effort: ensure webhook is registered on the provider for inbound messages
          await registerWebhook(instance, webhookUrl);
          try {
            await autoSyncHistoryOnce(admin, tenantId, instance, "status_connected");
          } catch (e) {
            console.error("auto sync-history after status failed:", e);
          }
        }
        return json({ instance: sanitize(instance), connected });
      }

      case "register-webhook": {
        if (!instance) return json({ error: "sem instância" }, 404);
        const ok = await registerWebhook(instance, webhookUrl);
        return json({ ok, webhook_url: webhookUrl(instance.webhook_secret) });
      }

      case "sync-history": {
        if (!instance) return json({ error: "sem instância" }, 404);
        if (!instance.is_connected) return json({ error: "instância não conectada" }, 400);
        // Executa na própria requisição para não perder a importação quando o Edge encerrar a execução.
        const maxChats = body?.maxChats ?? 80;
        const msgsPerChat = body?.msgsPerChat ?? 20;
        const r = await syncHistory(admin, tenantId, instance, maxChats, msgsPerChat);
        console.log("syncHistory done:", JSON.stringify(r));
        return json({ ok: true, ...r, message: `Importação concluída: ${r.chats} conversas e ${r.messages} mensagens.` });
      }

      case "disconnect": {
        if (!instance) return json({ error: "sem instância" }, 404);
        const keepHistory = body?.keep_history === true;
        if (instance.server_url && instance.instance_token) {
          try {
            await fetch(`${instance.server_url}/instance/disconnect`, {
              method: "POST",
              headers: { token: instance.instance_token },
            });
          } catch (e) { console.error("disconnect failed", e); }
        }
        const { data: upd } = await admin.from("whatsapp_instances").update({
          is_connected: false, status: "disconnected", qr_code: null,
        }).eq("id", instance.id).select("*").single();
        // Leads permanecem sempre (pipeline + lista de clientes).
        // Conversas/mensagens só são apagadas se o usuário NÃO pediu para manter o histórico.
        if (!keepHistory) {
          try {
            await admin.from("messages").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
            await admin.from("conversations").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
          } catch (e) { console.error("cleanup on disconnect failed", e); }
        }
        try {
          await admin.from("whatsapp_silence").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
        } catch (e) { console.error("silence cleanup failed", e); }
        return json({ instance: sanitize(upd), kept_history: keepHistory });
      }

      case "delete": {
        if (!instance) return json({ ok: true });
        const keepHistory = body?.keep_history === true;
        if (instance.server_url && instance.instance_token) {
          try {
            await fetch(`${instance.server_url}/instance`, {
              method: "DELETE",
              headers: { token: instance.instance_token },
            });
          } catch (e) { console.error("provider delete failed", e); }
        }
        try {
          if (keepHistory) {
            // Desvincula conversas/mensagens da instância para preservar o histórico
            await admin.from("messages").update({ whatsapp_instance_id: null }).eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
            await admin.from("conversations").update({ whatsapp_instance_id: null }).eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
          } else {
            await admin.from("messages").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
            await admin.from("conversations").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
          }
          await admin.from("whatsapp_silence").delete().eq("tenant_id", tenantId).eq("whatsapp_instance_id", instance.id);
        } catch (e) { console.error("cleanup on delete failed", e); }
        await admin.from("whatsapp_instances").delete().eq("id", instance.id);
        return json({ ok: true, kept_history: keepHistory });
      }

      case "silence-ai": {
        const phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        const minutes: number = Math.max(1, Math.min(60 * 24 * 30, Number(body?.minutes ?? 60)));
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        // Silence per (tenant, instance, phone) — falls back to current instance
        await admin.from("whatsapp_silence").delete()
          .eq("tenant_id", tenantId)
          .eq("phone", phone)
          .eq("whatsapp_instance_id", instance?.id ?? null);
        await admin.from("whatsapp_silence").insert({
          tenant_id: tenantId, phone, silenced_until: until,
          whatsapp_instance_id: instance?.id ?? null,
        });
        return json({ ok: true, silenced_until: until });
      }

      case "unsilence-ai": {
        const phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        const q = admin.from("whatsapp_silence").delete().eq("tenant_id", tenantId).eq("phone", phone);
        if (instance?.id) q.eq("whatsapp_instance_id", instance.id);
        await q;
        return json({ ok: true });
      }

      case "block-contact": {
        const phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        if (!instance?.server_url || !instance?.instance_token) {
          return json({ error: "instância não conectada" }, 400);
        }
        try {
          await fetch(`${instance.server_url}/contact/block`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.instance_token },
            body: JSON.stringify({ number: phone }),
          });
        } catch (e) { console.error("block failed", e); }
        return json({ ok: true });
      }

      case "delete-message": {
        const messageId: string = (body?.message_id ?? "").toString();
        const forEveryone: boolean = body?.for_everyone === true;
        if (!messageId) return json({ error: "message_id obrigatório" }, 400);

        // Carrega mensagem dentro do tenant.
        const { data: msg, error: msgErr } = await admin
          .from("messages")
          .select("id, external_id, direction, conversation_id, tenant_id, whatsapp_instance_id, lead_id")
          .eq("id", messageId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (msgErr || !msg) return json({ error: "mensagem não encontrada" }, 404);

        // Tenta apagar no provedor apenas se for outbound + temos external_id + "para todos".
        let providerOk = true;
        let providerErr: string | null = null;
        if (forEveryone && msg.direction === "outbound" && msg.external_id && instance?.server_url && instance?.instance_token) {
          // Recupera o telefone do lead para montar o JID.
          let phone: string | null = null;
          if (msg.lead_id) {
            const { data: ld } = await admin.from("leads").select("phone").eq("id", msg.lead_id).maybeSingle();
            phone = (ld?.phone ?? "").toString().replace(/[^0-9]/g, "") || null;
          }
          const attempts = [
            { url: `${instance.server_url}/message/delete`, body: { number: phone, messageid: msg.external_id, id: msg.external_id } },
            { url: `${instance.server_url}/message/delete`, body: { id: msg.external_id, number: phone } },
          ];
          providerOk = false;
          for (const a of attempts) {
            try {
              const r = await fetch(a.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: instance.instance_token },
                body: JSON.stringify(a.body),
              });
              if (r.ok) { providerOk = true; break; }
              providerErr = `provider ${r.status}`;
            } catch (e: any) {
              providerErr = e?.message ?? "provider error";
            }
          }
        }

        // Soft delete sempre — preserva auditoria/coaching.
        await admin
          .from("messages")
          .update({ status: "deleted", body: null, content: null, media_url: null })
          .eq("id", messageId)
          .eq("tenant_id", tenantId);

        return json({ ok: true, for_everyone: forEveryone, provider_ok: providerOk, provider_error: providerErr });
      }

      case "send-text": {
        let phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        const text: string = (body?.text ?? body?.body ?? "").toString();
        const messageId: string | null = body?.message_id ?? null;
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        // Normaliza para BR: se vier sem código do país (10 ou 11 dígitos), prepende 55.
        if (phone.length === 10 || phone.length === 11) {
          phone = `55${phone}`;
        }
        if (!text.trim()) return json({ error: "texto obrigatório" }, 400);
        if (!instance?.server_url || !instance?.instance_token) {
          return json({ error: "Instância WhatsApp não conectada" }, 400);
        }
        if (!instance.is_connected && instance.status !== "connected") {
          return json({ error: "Instância WhatsApp desconectada" }, 400);
        }

        try {
          const { response: r, text: raw, data: d } = await sendProviderText(instance.server_url, instance.instance_token, phone, text);
          if (!r.ok || isAuthProviderError(r, d, raw)) {
            console.error("send-text provider error", r.status, raw);
            await markMessageFailed(admin, messageId);
            const providerMsg = providerMessage(d, raw);
            const sessionDead = /disconnected|not reconnectable|logged out|loggedOut|unauthorized|session/i.test(providerMsg) || r.status === 401 || r.status === 503;
            if (sessionDead) {
              await admin.from("whatsapp_instances").update({
                is_connected: false,
                status: "disconnected",
                qr_code: null,
              }).eq("id", instance.id);
            }
            return json({ error: providerMsg || "falha no envio de texto", status: r.status }, 502);
          }
          await markMessageDelivered(admin, messageId, d);
          return json({ ok: true, provider: d });
        } catch (e: any) {
          console.error("send-text failed", e);
          await markMessageFailed(admin, messageId);
          return json({ error: e?.message ?? "erro ao enviar texto" }, 500);
        }
      }


      case "send-audio": {
        let phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        const audioUrl: string = (body?.audio_url ?? "").toString();
        const audioBase64: string = (body?.audio_base64 ?? "").toString();
        const ptt: boolean = body?.ptt !== false; // default true (voice note)
        const messageId: string | null = body?.message_id ?? null;
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
        if (!audioUrl && !audioBase64) return json({ error: "audio_url ou audio_base64 obrigatório" }, 400);
        if (!instance?.server_url || !instance?.instance_token) {
          return json({ error: "Instância WhatsApp não conectada" }, 400);
        }
        if (!instance.is_connected && instance.status !== "connected") {
          return json({ error: "Instância WhatsApp desconectada" }, 400);
        }
        try {
          const fileField = audioUrl || audioBase64;
          const r = await fetch(`${instance.server_url}/send/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.instance_token },
            body: JSON.stringify({
              number: phone,
              type: ptt ? "ptt" : "audio",
              file: fileField,
            }),
          });
          const { text: raw, data: d } = await parseProviderResponse(r);
          if (!r.ok || isAuthProviderError(r, d, raw)) {
            console.error("send-audio provider error", r.status, raw);
            if (messageId) {
              await admin.from("messages").update({ status: "failed" }).eq("id", messageId);
            }
            const providerMsg = (d?.message || d?.error || raw || "").toString();
            return json({ error: providerMsg || "falha no envio de áudio", status: r.status }, 502);
          }
          const providerId = d?.id || d?.messageId || d?.key?.id || null;
          if (messageId) {
            await admin.from("messages").update({
              status: "delivered",
              ...(providerId ? { external_id: providerId } : {}),
            }).eq("id", messageId);
          }
          return json({ ok: true, provider: d });
        } catch (e: any) {
          console.error("send-audio failed", e);
          if (messageId) {
            await admin.from("messages").update({ status: "failed" }).eq("id", messageId);
          }
          return json({ error: e?.message ?? "erro ao enviar áudio" }, 500);
        }
      }

      case "send-media": {
        let phone: string = (body?.phone ?? "").toString().replace(/[^0-9]/g, "");
        const mediaUrl: string = (body?.media_url ?? "").toString();
        const mediaBase64: string = (body?.media_base64 ?? "").toString();
        const mediaType: string = (body?.media_type ?? "image").toString(); // image | video | document
        const caption: string = (body?.caption ?? "").toString();
        const docName: string = (body?.doc_name ?? "").toString();
        const messageId: string | null = body?.message_id ?? null;
        if (!phone) return json({ error: "phone obrigatório" }, 400);
        if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
        if (!mediaUrl && !mediaBase64) return json({ error: "media_url ou media_base64 obrigatório" }, 400);
        if (!["image", "video", "document"].includes(mediaType)) {
          return json({ error: "media_type inválido" }, 400);
        }
        if (!instance?.server_url || !instance?.instance_token) {
          return json({ error: "Instância WhatsApp não conectada" }, 400);
        }
        if (!instance.is_connected && instance.status !== "connected") {
          return json({ error: "Instância WhatsApp desconectada" }, 400);
        }
        try {
          const fileField = mediaUrl || mediaBase64;
          const payload: Record<string, unknown> = {
            number: phone,
            type: mediaType,
            file: fileField,
          };
          if (caption) payload.text = caption;
          if (mediaType === "document" && docName) payload.docName = docName;
          const r = await fetch(`${instance.server_url}/send/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instance.instance_token },
            body: JSON.stringify(payload),
          });
          const { text: raw, data: d } = await parseProviderResponse(r);
          if (!r.ok || isAuthProviderError(r, d, raw)) {
            console.error("send-media provider error", r.status, raw);
            if (messageId) {
              await admin.from("messages").update({ status: "failed" }).eq("id", messageId);
            }
            const providerMsg = (d?.message || d?.error || raw || "").toString();
            return json({ error: providerMsg || "falha no envio de mídia", status: r.status }, 502);
          }
          const providerId = d?.id || d?.messageId || d?.key?.id || null;
          if (messageId) {
            await admin.from("messages").update({
              status: "delivered",
              ...(providerId ? { external_id: providerId } : {}),
            }).eq("id", messageId);
          }
          return json({ ok: true, provider: d });
        } catch (e: any) {
          console.error("send-media failed", e);
          if (messageId) {
            await admin.from("messages").update({ status: "failed" }).eq("id", messageId);
          }
          return json({ error: e?.message ?? "erro ao enviar mídia" }, 500);
        }
      }

      default:
        return json({ error: "ação inválida" }, 400);
    }

  } catch (e: any) {
    console.error("whatsapp-manage error", e);
    return json({ error: e?.message ?? "erro" }, 500);
  }
});