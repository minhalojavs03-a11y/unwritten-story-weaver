import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function ok(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CLASSIFY_PROMPT = `Você é um classificador de leads de uma administradora de consórcios brasileira (imóvel, automóvel e serviços). Leia o histórico recente da conversa via WhatsApp (cliente + loja) e responda em JSON válido com a estrutura EXATA:
{"temperature":"hot|warm|cold","stage":"novo|qualificado|agendado|compareceu|comprou|perdido","lead_phase":"prospeccao|primeiro_contato|apresentacao|simulacao|negociacao|fechamento|pos_venda|null","qualification_status":"em_qualificacao|qualificado|desqualificado|oportunidade_futura|null","reasoning":"1 frase curta em pt-BR"}

Regras de temperatura:
- "hot": pede simulação detalhada, fala em fechar agora, quer assinar contrato, pede reunião urgente
- "warm": pede valor de parcela/carta, tira dúvidas sobre prazo, taxa, sorteio ou contemplação, interesse sem urgência
- "cold": curiosidade vaga, "vou pensar", primeiro contato genérico

Regras de lead_phase (use a fase MAIS AVANÇADA já evidenciada na conversa):
- "prospeccao": loja ainda não conseguiu engajar / só saudações
- "primeiro_contato": cliente respondeu mas ainda não disse o que quer
- "apresentacao": loja já explicou produto/condições para o cliente
- "simulacao": uma simulação/carta foi enviada ou solicitada com valor/prazo definido
- "negociacao": cliente está discutindo parcela, lance, prazo, entrada — quase fechando
- "fechamento": cliente confirmou que vai fechar / pediu dados de pagamento / contrato
- "pos_venda": contrato assinado / pagamento feito / cliente já é cotista

Regras de qualification_status:
- "qualificado": cliente tem interesse claro e perfil compatível
- "em_qualificacao": ainda coletando informações (renda, bem desejado, urgência)
- "desqualificado": cliente sem interesse, sem renda, número errado, já comprou em outro lugar
- "oportunidade_futura": tem interesse mas só daqui a alguns meses

Regras de stage (espelhe a fase): simulacao/apresentacao→agendado, negociacao/fechamento→compareceu, pos_venda→comprou, desqualificado→perdido, qualificado→qualificado, caso contrário→novo. Use null para campos sem evidência.`;


async function classifyLead(history: { from: "client"|"loja"; text: string }[]): Promise<{
  temperature: "hot"|"warm"|"cold";
  stage: string;
  lead_phase: string | null;
  qualification_status: string | null;
  reasoning: string;
} | null> {
  try {
    const convo = history.slice(-12).map((m) => `${m.from === "client" ? "Cliente" : "Loja"}: ${m.text}`).join("\n");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          { role: "user", content: convo || "(sem histórico)" },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const parsed = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
    if (!["hot","warm","cold"].includes(parsed.temperature)) parsed.temperature = "warm";
    if (!["novo","qualificado","agendado","compareceu","comprou","perdido"].includes(parsed.stage)) parsed.stage = "novo";
    const validPhases = ["prospeccao","primeiro_contato","apresentacao","simulacao","negociacao","fechamento","pos_venda"];
    parsed.lead_phase = validPhases.includes(parsed.lead_phase) ? parsed.lead_phase : null;
    const validQual = ["em_qualificacao","qualificado","desqualificado","oportunidade_futura"];
    parsed.qualification_status = validQual.includes(parsed.qualification_status) ? parsed.qualification_status : null;
    return parsed;
  } catch (e) {
    console.error("classify failed", e);
    return null;
  }
}

const STAGE_RANK: Record<string, number> = { novo: 0, qualificado: 1, agendado: 2, compareceu: 3, comprou: 4, perdido: -1 };

async function extractAppointment(history: { from: "client"|"loja"; text: string; at: string }[]): Promise<{ has: boolean; iso?: string; type?: string; reasoning?: string } | null> {
  if (!history.length) return null;
  const nowIso = new Date().toISOString();
  const sys = `Você analisa um trecho de conversa de WhatsApp entre uma ótica e um cliente. Sua tarefa: identificar se um AGENDAMENTO foi CONFIRMADO mutuamente (data + horário específicos) nesta conversa.

Regras estritas:
- "has": true SOMENTE se houver data E horário específicos confirmados (ex.: "amanhã às 15h", "sexta 10:30", "dia 12/05 às 09h"). Não conte propostas pendentes ("posso te encaixar amanhã?" sem confirmação).
- Resolva datas relativas ("hoje", "amanhã", "segunda", "próxima semana") com base em AGORA: ${nowIso} (timezone America/Sao_Paulo, UTC-3).
- Retorne "iso" no formato ISO 8601 com offset -03:00 (ex.: 2026-05-06T15:00:00-03:00).
- "type": "consulta" | "retirada" | "ajuste" | "outro".
- Se não houver agendamento confirmado, "has": false e omita os outros campos.
- "reasoning": 1 frase curta em português.`;

  const userText = history.map((h) => `[${h.at}] ${h.from === "client" ? "CLIENTE" : "LOJA"}: ${h.text}`).join("\n");

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userText },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) { console.error("extractAppointment AI error", r.status, await r.text()); return null; }
    const d = await r.json();
    const parsed = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
    if (!parsed?.has) return { has: false };
    if (!parsed?.iso || isNaN(new Date(parsed.iso).getTime())) return { has: false };
    const when = new Date(parsed.iso).getTime();
    // Sanidade: precisa estar no futuro próximo (até 180 dias) e não no passado >1h
    if (when < Date.now() - 60 * 60 * 1000) return { has: false };
    if (when > Date.now() + 180 * 24 * 60 * 60 * 1000) return { has: false };
    return { has: true, iso: parsed.iso, type: parsed.type ?? "consulta", reasoning: parsed.reasoning };
  } catch (e) {
    console.error("extractAppointment failed", e);
    return null;
  }
}

function cleanName(value: any): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // ignore pure-digit / phone-like "names" returned by some providers
  if (/^[\d+\s().-]+$/.test(raw)) return null;
  return raw.length > 120 ? raw.slice(0, 120) : raw;
}

// BR phone variants (with/without the leading 9 after DDD) — mirrors whatsapp-manage
export function phoneVariants(phone: string): string[] {
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

export function canonicalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let d = digits;
  if (d.length === 12 && d.startsWith("55")) d = d.slice(0, 4) + "9" + d.slice(4);
  else if (d.length === 11 && d[2] === "9") d = "55" + d;
  return `+${d}`;
}

function leadOwnerPatchFromInstance(instance: any, lead?: any): Record<string, any> {
  if (!instance?.seller_user_id) return {};
  if (lead?.assigned_to || lead?.assigned_member_id) return {};
  return { assigned_to: instance.seller_user_id };
}

type ExtractedMedia = {
  url: string | null;
  base64: string | null;
  mime: string | null;
  kind: "audio" | "image" | "video" | "document" | "sticker" | null;
  caption: string | null;
  fileName: string | null;
  durationSec: number | null;
};

function extractMediaFromPayload(payload: any, m: any): ExtractedMedia {
  // uazapi flat fields (uazapi v2 puts type/mediaType/messageType on the message object)
  const flatType: string | undefined =
    payload?.messageType ?? payload?.type ?? payload?.mediaType ??
    m?.messageType ?? m?.type ?? m?.mediaType;
  const flatUrl: string | undefined =
    m?.mediaUrl ?? m?.media_url ?? m?.fileUrl ?? m?.file_url ?? m?.url ?? m?.fileURL ?? m?.directPath ??
    payload?.mediaUrl ?? payload?.media_url ?? payload?.fileUrl ?? payload?.file_url ?? payload?.url ?? payload?.fileURL;
  const flatMime: string | undefined =
    m?.mimetype ?? m?.mimeType ?? m?.mime ??
    payload?.mimetype ?? payload?.mimeType ?? payload?.mime;
  // uazapi sometimes embeds the raw base64 directly in `content` for media messages.
  const contentIsBase64 = typeof m?.content === "string"
    && m.content.length > 200
    && /^[A-Za-z0-9+/=\s]+$/.test(m.content)
    && !/\s/.test(m.content.trim().slice(0, 80));
  const flatB64: string | undefined =
    m?.base64 ?? m?.fileBase64 ?? m?.file_base64 ?? m?.fileEncoded ??
    payload?.base64 ?? payload?.fileBase64 ??
    (contentIsBase64 ? m.content : undefined);
  const flatCaption: string | undefined = m?.caption ?? m?.text ?? payload?.caption;
  const flatFileName: string | undefined = m?.fileName ?? m?.filename ?? m?.documentName ?? payload?.fileName ?? payload?.filename;
  const flatDuration: number | undefined = m?.seconds ?? m?.duration ?? payload?.seconds ?? payload?.duration;

  // Baileys-style nested
  const inner = m?.message ?? payload?.message ?? {};
  const nested =
    inner?.audioMessage ?? inner?.imageMessage ?? inner?.videoMessage ??
    inner?.documentMessage ?? inner?.stickerMessage ?? inner?.pttMessage ?? null;
  const nestedKind: ExtractedMedia["kind"] = inner?.audioMessage || inner?.pttMessage
    ? "audio"
    : inner?.imageMessage ? "image"
    : inner?.videoMessage ? "video"
    : inner?.documentMessage ? "document"
    : inner?.stickerMessage ? "sticker"
    : null;

  let kind: ExtractedMedia["kind"] = nestedKind;
  if (!kind && typeof flatType === "string") {
    const t = flatType.toLowerCase();
    if (t.includes("audio") || t === "ptt" || t.includes("ptt") || t.includes("voice")) kind = "audio";
    else if (t.includes("image") || t === "photo") kind = "image";
    else if (t.includes("video")) kind = "video";
    else if (t.includes("document") || t === "file") kind = "document";
    else if (t.includes("sticker")) kind = "sticker";
  }
  if (!kind && flatMime) {
    if (flatMime.startsWith("audio/")) kind = "audio";
    else if (flatMime.startsWith("image/")) kind = "image";
    else if (flatMime.startsWith("video/")) kind = "video";
    else kind = "document";
  }
  // Last resort: presence of mediaUrl/base64 even without an explicit type → assume document
  if (!kind && (flatUrl || flatB64)) kind = "document";

  if (!kind) return { url: null, base64: null, mime: null, kind: null, caption: null, fileName: null, durationSec: null };

  return {
    url: flatUrl ?? nested?.url ?? nested?.directPath ?? null,
    base64: flatB64 ?? nested?.fileBase64 ?? null,
    mime: flatMime ?? nested?.mimetype ?? null,
    kind,
    caption: flatCaption ?? nested?.caption ?? null,
    fileName: flatFileName ?? nested?.fileName ?? null,
    durationSec: typeof flatDuration === "number" ? flatDuration : (typeof nested?.seconds === "number" ? nested.seconds : null),
  };
}

// Fallback: ask uazapi to give us the media bytes for a given external messageid.
// Used when the webhook payload only signals the media kind but no URL/base64.
async function fetchProviderMediaBytes(instance: any, externalId: string | null): Promise<{ base64: string | null; mime: string | null; fileName: string | null }> {
  if (!externalId || !instance?.server_url || !instance?.instance_token) return { base64: null, mime: null, fileName: null };
  const endpoints: Array<{ url: string; body: Record<string, unknown> }> = [
    { url: `${instance.server_url}/message/download`, body: { messageid: externalId } },
    { url: `${instance.server_url}/message/download`, body: { id: externalId } },
    { url: `${instance.server_url}/chat/getBase64FromMediaMessage`, body: { message: { key: { id: externalId } }, convertToMp4: false } },
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.instance_token },
        body: JSON.stringify(ep.body),
      });
      if (!r.ok) continue;
      const d = await r.json().catch(() => null);
      if (!d) continue;
      const base64: string | null =
        d?.base64 ?? d?.fileBase64 ?? d?.data?.base64 ?? d?.data?.fileBase64 ??
        d?.media ?? d?.result?.base64 ?? null;
      const mime: string | null =
        d?.mimetype ?? d?.mimeType ?? d?.contentType ?? d?.data?.mimetype ?? null;
      const fileName: string | null = d?.fileName ?? d?.filename ?? d?.data?.fileName ?? null;
      if (base64) return { base64, mime, fileName };
    } catch (e) {
      console.warn("fetchProviderMediaBytes failed", ep.url, (e as any)?.message);
    }
  }
  return { base64: null, mime: null, fileName: null };
}

function extractMessage(payload: any): {
  fromMe: boolean;
  isGroup: boolean;
  phone: string | null;
  text: string | null;
  externalId: string | null;
  pushName: string | null;
  avatar: string | null;
  media: ExtractedMedia;
} {
  const m = payload?.message ?? payload?.data?.message ?? payload?.data ?? payload;
  const chat = payload?.chat ?? m?.chat ?? payload?.data?.chat ?? {};
  const sender = payload?.sender ?? m?.sender ?? payload?.data?.sender ?? {};
  const contact = payload?.contact ?? m?.contact ?? payload?.data?.contact ?? {};
  const key = m?.key ?? payload?.key ?? {};
  const remoteJid: string = key.remoteJid ?? m?.remoteJid ?? m?.chatid ?? m?.from ?? chat?.wa_chatid ?? "";
  const isGroup = remoteJid.endsWith?.("@g.us") || m?.isGroup === true || chat?.wa_isGroup === true;
  const fromMe = key.fromMe === true || m?.fromMe === true || payload?.fromMe === true;
  let phone: string | null = remoteJid ? remoteJid.split("@")[0] : (m?.from ?? null);
  if (!phone && chat?.phone) phone = String(chat.phone).replace(/\D/g, "");
  if (phone) phone = phone.replace(/\D/g, "") || null;
  const rawContent =
    m?.message?.conversation ??
    m?.message?.extendedTextMessage?.text ??
    m?.body ??
    m?.text ??
    m?.content ??
    null;
  // Some providers (uazapi) stuff the media base64 into `content`. Never treat that as text.
  const looksLikeBase64 = typeof rawContent === "string"
    && rawContent.length > 200
    && /^[A-Za-z0-9+/=\s]+$/.test(rawContent)
    && !rawContent.includes(" ");
  const text = looksLikeBase64 ? null : rawContent;
  const externalId =
    m?.messageid ??
    m?.messageId ??
    m?.id ??
    key?.id ??
    payload?.messageid ??
    payload?.messageId ??
    payload?.id ??
    null;
  const pushName =
    cleanName(m?.pushName) ??
    cleanName(m?.pushname) ??
    cleanName(payload?.pushName) ??
    cleanName(payload?.pushname) ??
    cleanName(payload?.data?.pushName) ??
    cleanName(payload?.data?.pushname) ??
    cleanName(sender?.pushName) ??
    cleanName(sender?.name) ??
    cleanName(contact?.name) ??
    cleanName(contact?.verifiedName) ??
    cleanName(contact?.notify) ??
    cleanName(chat?.wa_contactName) ??
    cleanName(chat?.wa_name) ??
    cleanName(chat?.lead_fullName) ??
    cleanName(chat?.lead_name) ??
    cleanName(chat?.name) ??
    null;
  const avatar = normalizeAvatar(
    m?.image ?? m?.imagePreview ?? m?.profilePicUrl ?? m?.profilePictureUrl ?? m?.picture ?? m?.photo ?? m?.avatar ??
    payload?.image ?? payload?.imagePreview ?? payload?.profilePicUrl ?? payload?.profilePictureUrl ??
    payload?.data?.image ?? payload?.data?.profilePicUrl ?? null
  );
  const media = extractMediaFromPayload(payload, m);
  return { fromMe, isGroup, phone, text, externalId: externalId ? String(externalId).trim() : null, pushName, avatar, media };
}

const MEDIA_EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/ogg; codecs=opus": "ogg", "audio/opus": "ogg",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/m4a": "m4a",
  "audio/wav": "wav", "audio/webm": "webm",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

function extFromMime(mime: string | null, fallback: string): string {
  if (!mime) return fallback;
  const clean = mime.split(";")[0].trim().toLowerCase();
  return MEDIA_EXT[clean] ?? (clean.split("/")[1] || fallback);
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  audio: "🎤 Mensagem de voz",
  image: "📷 Imagem",
  video: "🎬 Vídeo",
  document: "📎 Documento",
  sticker: "🌟 Figurinha",
};

async function uploadMediaToStorage(
  admin: any,
  instance: any,
  tenantId: string,
  conversationId: string,
  media: ExtractedMedia,
): Promise<{ url: string | null; mime: string | null }> {
  try {
    let bytes: Uint8Array | null = null;
    let mime = media.mime ?? null;

    if (media.base64) {
      const b64 = media.base64.includes(",") ? media.base64.split(",").pop()! : media.base64;
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (media.url) {
      const headers: Record<string, string> = {};
      if (instance?.instance_token) headers["token"] = instance.instance_token;
      const r = await fetch(media.url, { headers });
      if (!r.ok) {
        console.error("media download failed", r.status, media.url);
        return { url: null, mime };
      }
      mime = mime ?? r.headers.get("content-type");
      const buf = await r.arrayBuffer();
      bytes = new Uint8Array(buf);
    } else {
      return { url: null, mime };
    }

    const ext = extFromMime(mime, media.kind === "audio" ? "ogg" : "bin");

    // 🎤 Áudios vão para o Google Drive (libera espaço do Supabase Storage)
    if (media.kind === "audio") {
      const driveUrl = await uploadAudioToGoogleDrive(bytes, mime ?? "audio/ogg", ext, tenantId, conversationId);
      if (driveUrl) return { url: driveUrl, mime };
      console.warn("[drive] fallback para Supabase Storage (drive falhou)");
    }

    const path = `${tenantId}/${conversationId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from("chat-media").upload(path, bytes, {
      contentType: mime ?? "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      console.error("storage upload error", upErr);
      return { url: null, mime };
    }
    const { data: pub } = admin.storage.from("chat-media").getPublicUrl(path);
    return { url: pub?.publicUrl ?? null, mime };
  } catch (e) {
    console.error("uploadMediaToStorage error", e);
    return { url: null, mime: media.mime ?? null };
  }
}

// Upload de áudio para o Google Drive via connector gateway
async function uploadAudioToGoogleDrive(
  bytes: Uint8Array,
  mime: string,
  ext: string,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    const DRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!LOVABLE_KEY || !DRIVE_KEY) {
      console.error("[drive] missing LOVABLE_API_KEY or GOOGLE_DRIVE_API_KEY");
      return null;
    }

    const filename = `feracon_${conversationId}_${Date.now()}.${ext}`;
    const metadata = { name: filename, description: `Feracon CRM audio (tenant ${tenantId})` };
    const boundary = `----feracon${crypto.randomUUID().replace(/-/g, "")}`;

    // monta corpo multipart/related
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);

    const uploadRes = await fetch(
      "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "X-Connection-Api-Key": DRIVE_KEY,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!uploadRes.ok) {
      console.error("[drive] upload falhou", uploadRes.status, await uploadRes.text());
      return null;
    }
    const { id: fileId } = await uploadRes.json();
    if (!fileId) {
      console.error("[drive] resposta sem fileId");
      return null;
    }

    // libera leitura pública
    const permRes = await fetch(
      `https://connector-gateway.lovable.dev/google_drive/drive/v3/files/${fileId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "X-Connection-Api-Key": DRIVE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      },
    );
    if (!permRes.ok) {
      console.error("[drive] erro permission", permRes.status, await permRes.text());
      // mesmo sem permissão pública retornamos null pra cair no fallback
      return null;
    }

    // URL pública de download direto (funciona em <audio src=>)
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  } catch (e) {
    console.error("[drive] exception", e);
    return null;
  }
}

function normalizeAvatar(value: any): string | null {
  if (!value) return null;
  const raw = typeof value === "string" ? value.trim() : (value.url ?? value.image ?? value.base64 ?? "").toString().trim();
  if (!raw) return null;
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const compact = raw.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length > 80) return `data:image/jpeg;base64,${compact}`;
  return null;
}

async function callAI(systemPrompt: string, userText: string): Promise<string> {
  return callAIWithHistory(systemPrompt, [], userText);
}

async function callAIWithHistory(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  userText: string,
): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userText },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("AI error", r.status, t);
    return ""; // never send fallback text to leads; stay silent on AI failure
  }
  const d = await r.json();
  return d?.choices?.[0]?.message?.content ?? "";
}

// === Delay humano leve antes de cada envio (modo normal pós-manutenção).
async function randomSendDelay(): Promise<void> {
  // Modo normal: pequeno jitter humano (1.5s–4s) para não parecer robô,
  // sem os longos delays do modo manutenção.
  let ms = 1500 + Math.floor(Math.random() * 2500);
  if (Math.random() < 0.05) ms += 3000 + Math.floor(Math.random() * 7000);
  await new Promise((r) => setTimeout(r, ms));
}

async function sendText(serverUrl: string, instanceToken: string, phone: string, text: string): Promise<string | null> {
  await randomSendDelay();
  try {
    const r = await fetch(`${serverUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: phone, text, message: text }),
    });
    const raw = await r.text().catch(() => "");
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    return data?.id ?? data?.messageId ?? data?.key?.id ?? null;
  } catch (e) {
    console.error("send failed", e);
    return null;
  }
}

async function notifySellerRoundRobin(admin: any, instance: any, lead: any, firstMessage: string) {
  try {
    const { data: sellers } = await admin
      .from("whatsapp_sellers")
      .select("id, name, phone, last_notified_at")
      .eq("whatsapp_instance_id", instance.id)
      .eq("notify_on_new_lead", true)
      .not("phone", "is", null)
      .order("last_notified_at", { ascending: true, nullsFirst: true })
      .limit(1);
    const seller = sellers?.[0];
    if (!seller?.phone) {
      console.log("notifySellerRoundRobin: no eligible seller");
      return;
    }
    const sellerPhone = seller.phone.toString().replace(/[^0-9]/g, "");
    if (sellerPhone.length < 10) {
      console.log("notifySellerRoundRobin: invalid seller phone", seller.phone);
      return;
    }
    const leadName = lead?.name ?? lead?.phone ?? "novo contato";
    const leadPhone = lead?.phone ?? "";
    const msg = `🔔 *Novo lead na loja*\n\n👤 ${leadName}\n📱 ${leadPhone}\n💬 "${(firstMessage ?? "").slice(0, 160)}"\n\nAcesse o CRM para atender.`;
    await sendText(instance.server_url, instance.instance_token, sellerPhone, msg);
    await Promise.all([
      admin.from("whatsapp_sellers").update({ last_notified_at: new Date().toISOString() }).eq("id", seller.id),
      seller.user_id
        ? admin.from("leads").update({ assigned_to: seller.user_id }).eq("id", lead.id)
        : Promise.resolve(),
    ]);
    console.log("notifySellerRoundRobin: notified", seller.name, sellerPhone);
  } catch (e) {
    console.error("notifySellerRoundRobin failed", e);
  }
}

async function detectHumanHandoff(text: string): Promise<boolean> {
  const lower = text.toLowerCase();
  // Fast path: óbvios
  if (/(atendente humano|falar com (alguem|algu[ée]m|humano|pessoa|consultor|vendedor|gerente)|atendimento humano|quero (um )?humano|pessoa de verdade|n[aã]o (quero|gosto) (de )?(rob[oô]|bot|ia))/i.test(lower)) {
    return true;
  }
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: `Você decide se o cliente está pedindo CLARAMENTE para falar com um humano (vendedor, consultor, atendente, gerente, pessoa de verdade) em vez de continuar com a IA. Responda APENAS em JSON: {"wants_human": true|false}. Se houver qualquer dúvida ou só reclamação genérica, retorne false.` },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return false;
    const d = await r.json();
    const parsed = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
    return parsed?.wants_human === true;
  } catch (e) {
    console.error("detectHumanHandoff failed", e);
    return false;
  }
}

async function notifyAllSellersHandoff(admin: any, instance: any, lead: any, lastMessage: string) {
  try {
    const { data: sellers } = await admin
      .from("whatsapp_sellers")
      .select("id, name, phone")
      .eq("tenant_id", instance.tenant_id)
      .eq("notify_on_new_lead", true)
      .not("phone", "is", null);
    if (!sellers?.length) {
      console.log("notifyAllSellersHandoff: no sellers");
      return;
    }
    const leadName = lead?.name ?? lead?.phone ?? "Cliente";
    const leadPhone = lead?.phone ?? "";
    const msg = `🚨 *Cliente pedindo atendimento HUMANO*\n\n👤 ${leadName}\n📱 ${leadPhone}\n💬 "${(lastMessage ?? "").slice(0, 200)}"\n\n⚡ Assuma o atendimento o quanto antes.`;
    await Promise.all(
      sellers.map(async (s: any) => {
        const ph = s.phone.toString().replace(/[^0-9]/g, "");
        if (ph.length < 10) return;
        try {
          await sendText(instance.server_url, instance.instance_token, ph, msg);
          await admin.from("lead_notifications").insert({
            tenant_id: instance.tenant_id,
            lead_id: lead.id,
            type: "human_handoff",
            recipient_phone: ph,
            message_sent: msg,
            delivered: true,
          });
        } catch (e) {
          console.error("notifyAllSellersHandoff send failed", s.name, e);
        }
      }),
    );
  } catch (e) {
    console.error("notifyAllSellersHandoff error", e);
  }
}

const WEEKDAYS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

async function buildKnowledgePrompt(admin: any, tenantId: string, tenantName: string | undefined, aiCfg: any, isFirstContact: boolean, aiTurnsSoFar = 0, isLastTurn = false): Promise<string> {
  const parts: string[] = [];
  const name = tenantName ?? "nossa administradora de consórcios";
  parts.push(`Você é o assistente virtual de PRÉ-ATENDIMENTO da ${name} no WhatsApp, especialista em CONSÓRCIO (imóvel, automóvel e serviços). Sua função é qualificar RAPIDAMENTE o lead e ENCAMINHAR ao consultor humano. Tom: ${aiCfg?.tone ?? "amigavel"}.

MISSÃO (ULTRA OBJETIVA):
- Faça poucas perguntas curtas (tipo de bem, valor da carta, prazo, urgência, cidade). Pule o que o cliente já respondeu.
- Assim que tiver as informações básicas, ENCAMINHE ao consultor.

LIMITE DE MENSAGENS (CRÍTICO):
- Você já enviou ${aiTurnsSoFar} mensagem(ns). Limite TOTAL: 5 mensagens da IA.
- ${isLastTurn ? "ÚLTIMA MENSAGEM. NÃO faça nova pergunta. Em 1 frase curta avise que o consultor assume agora aqui mesmo. PARE." : "Avance a qualificação em UMA pergunta. Não repita o que já foi respondido."}

ESTILO (OBRIGATÓRIO):
- DIRETO, como pessoa real no WhatsApp.
- MÁXIMO 1 frase curta por resposta. Até ~160 caracteres. NUNCA 2 perguntas juntas.
- Sem listas, sem markdown, sem títulos, sem rodapé. No máximo 1 emoji, e só quando soar natural.
- Use SOMENTE as informações abaixo. NUNCA invente valores, taxas, lances ou regras.

CONSULTOR (CRÍTICO):
- Sempre "o consultor" (artigo definido). NUNCA invente nome, telefone, e-mail ou horário.
- NUNCA prometa "vou verificar" ou "já te retorno". Se não souber, diga em 1 frase que o consultor assume agora — e PARE.

RECUSA (NUNCA INSISTIR):
- Se o cliente recusar, disser que não tem interesse ou pedir para não receber: responda 1 frase cordial de encerramento e PARE.
${isFirstContact ? `\nPRIMEIRO CONTATO:\n- Cumprimente pelo nome (se souber) em 1 frase + UMA pergunta de qualificação. NADA além disso.` : ""}`);


  if (aiCfg?.business_description) parts.push(`SOBRE A ADMINISTRADORA:\n${aiCfg.business_description}`);
  const contact: string[] = [];
  if (aiCfg?.address) contact.push(`Endereço: ${aiCfg.address}`);
  if (aiCfg?.phone) contact.push(`Telefone: ${aiCfg.phone}`);
  if (aiCfg?.whatsapp) contact.push(`WhatsApp: ${aiCfg.whatsapp}`);
  if (aiCfg?.website) contact.push(`Site: ${aiCfg.website}`);
  if (contact.length) parts.push(`CONTATO:\n${contact.join("\n")}`);

  if (aiCfg?.services) parts.push(`TIPOS DE CONSÓRCIO / SEGMENTOS:\n${aiCfg.services}`);
  if (aiCfg?.insurance_plans) parts.push(`ADMINISTRADORAS PARCEIRAS / GRUPOS:\n${aiCfg.insurance_plans}`);
  if (aiCfg?.payment_methods) parts.push(`FORMAS DE PAGAMENTO DA PARCELA:\n${aiCfg.payment_methods}`);
  if (aiCfg?.differentials) parts.push(`DIFERENCIAIS:\n${aiCfg.differentials}`);
  if (aiCfg?.extra_notes) parts.push(`OBSERVAÇÕES IMPORTANTES:\n${aiCfg.extra_notes}`);

  const { data: hours } = await admin.from("business_hours").select("*").eq("tenant_id", tenantId).order("weekday");
  if (hours?.length) {
    const lines = hours.map((h: any) => `${WEEKDAYS[h.weekday]}: ${h.closed ? "Fechado" : `${h.open_time ?? "-"} às ${h.close_time ?? "-"}`}`);
    parts.push(`HORÁRIO DE FUNCIONAMENTO:\n${lines.join("\n")}`);
  }

  const { data: faqs } = await admin.from("faqs").select("question,answer").eq("tenant_id", tenantId).order("position");
  if (faqs?.length) {
    parts.push(`PERGUNTAS FREQUENTES:\n${faqs.map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")}`);
  }

  const { data: products } = await admin.from("products").select("name,category,price").eq("tenant_id", tenantId).eq("is_active", true).limit(80);
  if (products?.length) {
    const lines = products.map((p: any) => {
      const bits = [p.name];
      if (p.category) bits.push(p.category);
      if (p.price != null) bits.push(`R$ ${Number(p.price).toFixed(2)}`);
      return `- ${bits.join(" · ")}`;
    });
    parts.push(`CARTAS DE CRÉDITO DISPONÍVEIS (parcial):\n${lines.join("\n")}`);
  }

  if (aiCfg?.system_prompt) parts.push(`INSTRUÇÕES ADICIONAIS:\n${aiCfg.system_prompt}`);

  return parts.join("\n\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const rawSecret = url.searchParams.get("secret");
    const secret = rawSecret?.split("/")[0]?.trim() || null;
    if (!secret) return ok({ error: "missing secret" }, 401);
    if (rawSecret !== secret) {
      console.warn("webhook: normalized provider-mutated secret", { suffix: rawSecret?.slice(secret.length, 80) });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("webhook_secret", secret)
      .maybeSingle();
    if (!instance) return ok({ error: "instance not found" }, 404);

    // SINGLE-TENANT FERACON: independente de qual instância dispare o webhook,
    // todos leads/conversas/mensagens DEVEM ficar no tenant Feracon. Instâncias
    // órfãs em outros tenants estavam fazendo respostas de clientes irem para
    // leads duplicados "kind=outros" invisíveis para a equipe.
    const FERACON_TENANT_ID = "9ecb99e2-50ee-404f-920b-81cd94cc685e";
    if (instance.tenant_id !== FERACON_TENANT_ID) {
      console.warn("webhook: coercing instance tenant_id to Feracon", {
        instance_id: instance.id,
        original_tenant: instance.tenant_id,
      });
      instance.tenant_id = FERACON_TENANT_ID;
    }

    const payload = await req.json().catch(() => ({}));
    const evt = String(payload?.event ?? payload?.type ?? "").toLowerCase();
    console.log("webhook payload event=", evt);

    // Detecta eventos de conexão (qrcode pareado / sessão conectada) para já
    // marcar a instância como conectada no banco e disparar a importação
    // automática do histórico — sem depender do frontend abrir a página de
    // polling. Vale para QUALQUER consultor que conectar o WhatsApp.
    const connState = String(
      payload?.state ?? payload?.data?.state ?? payload?.connection ?? payload?.data?.connection ?? ""
    ).toLowerCase();
    const isConnectionEvent =
      evt.includes("connection") ||
      evt === "qrcode.updated" || evt === "qr.updated" ||
      evt === "ready" || evt === "logged_in" || evt === "open" ||
      connState === "open" || connState === "connected" || connState === "ready";
    if (isConnectionEvent && !instance.is_connected) {
      await admin
        .from("whatsapp_instances")
        .update({ is_connected: true, status: "connected", last_connection_at: new Date().toISOString() })
        .eq("id", instance.id);
      instance.is_connected = true;
      instance.status = "connected";
    }

    // Importação automática (oportunística) do histórico: se a instância já está
    // conectada mas ainda não importamos as conversas antigas, dispara uma
    // tentativa em background. A própria função admin-sync-history é throttled e
    // idempotente (não roda novamente se já trouxe chats).
    const instMeta = (instance.metadata ?? {}) as Record<string, any>;
    const prevTotal = Number(instMeta?.history_sync_result?.total_chats ?? 0);
    const alreadyCompleted = !!instMeta.history_sync_completed_at && prevTotal > 0;
    const lastAttemptMs = instMeta.history_sync_started_at ? new Date(instMeta.history_sync_started_at).getTime() : 0;
    const canRetry = Date.now() - lastAttemptMs > 30_000;
    if (instance.is_connected && !alreadyCompleted && canRetry) {
      // Fire-and-forget — não bloqueia o processamento do webhook.
      fetch(`${SUPABASE_URL}/functions/v1/whatsapp-manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({
          action: "admin-sync-history",
          tenant_id: instance.tenant_id,
          instance_id: instance.id,
          maxChats: 200,
          msgsPerChat: 30,
        }),
      }).catch((e) => console.error("auto admin-sync-history failed", e));
    }


    // Bloqueia eventos puros de sincronização de histórico que o provedor dispara
    // ao (re)conectar — não viram lead, mas o auto-sync acima já cuidou de
    // importar o histórico completo via API.
    if (
      evt.includes("history") ||
      evt.includes("chats.set") ||
      evt.includes("messages.set") ||
      evt === "messages_history" ||
      payload?.isHistorySync === true ||
      payload?.history === true ||
      payload?.data?.isHistorySync === true
    ) {
      console.log("webhook ignored: history-sync event", evt);
      return ok({ ignored: "history_sync" });
    }

    // ACK / status updates ("messages.update", "ack", "message_ack", etc.):
    // o provedor envia o id externo da mensagem com um novo status quando o
    // lead recebe (delivered) ou abre (read/played) o que mandamos.
    const isAckEvent =
      evt.includes("ack") ||
      evt === "messages.update" ||
      evt === "message.update" ||
      evt === "message_status" ||
      payload?.ack != null ||
      payload?.data?.ack != null ||
      payload?.status != null ||
      payload?.data?.status != null;
    if (isAckEvent) {
      const d = payload?.data ?? payload;
      const extId: string | null = (
        d?.key?.id ?? d?.messageid ?? d?.messageId ?? d?.id ??
        payload?.key?.id ?? payload?.messageid ?? payload?.messageId ?? payload?.id ?? null
      )?.toString() ?? null;
      const ackNum: number | null = (() => {
        const n = Number(d?.ack ?? payload?.ack);
        return isNaN(n) ? null : n;
      })();
      const ackStr: string = String(
        d?.update?.status ?? d?.status ?? payload?.status ?? ""
      ).toUpperCase();
      let newStatus: "delivered" | "read" | null = null;
      if (ackNum != null) {
        if (ackNum >= 3) newStatus = "read";
        else if (ackNum === 2) newStatus = "delivered";
      } else if (ackStr) {
        if (/READ|PLAYED/.test(ackStr)) newStatus = "read";
        else if (/DELIVER|SERVER_ACK/.test(ackStr)) newStatus = "delivered";
      }
      if (extId && newStatus) {
        const patch: Record<string, any> = { status: newStatus };
        if (newStatus === "read") patch.read_at = new Date().toISOString();
        const { error: ackErr } = await admin
          .from("messages")
          .update(patch)
          .eq("tenant_id", instance.tenant_id)
          .eq("external_id", extId);
        if (ackErr) console.error("ack update error", ackErr);
        return ok({ ack: newStatus, external_id: extId });
      }
      // se não conseguir mapear, segue o fluxo (pode ser uma mensagem nova)
    }

    const { fromMe, isGroup, phone, text: rawText, externalId, pushName, avatar, media } = extractMessage(payload);
    let hasMedia = !!media.kind && (!!media.url || !!media.base64);

    // ===========================================================================
    // BLOQUEIO DE CONVERSAS INTERNAS:
    // Mensagens cujo "outro lado" é o próprio número oficial da empresa
    // (4792352804) OU o telefone de qualquer membro interno (tenant_members)
    // NÃO devem virar lead nem ser anexadas a thread de cliente. Esses são
    // disparos de notificação/teste consultor↔empresa e estavam vazando para
    // conversas de leads aleatórios via lookup por telefone.
    // ===========================================================================
    if (phone) {
      const peerDigits = phone.replace(/\D/g, "");
      const NOTIFIER_DIGITS = "4792352804";
      const peerTail = peerDigits.replace(/^55/, "");
      const isCompanyNotifier =
        peerDigits.endsWith(NOTIFIER_DIGITS) || peerTail.endsWith(NOTIFIER_DIGITS);
      let isInternalMember = false;
      if (!isCompanyNotifier && peerTail.length >= 10) {
        const { data: memberHit } = await admin
          .from("tenant_members")
          .select("id")
          .eq("tenant_id", instance.tenant_id)
          .eq("is_active", true)
          .not("phone", "is", null)
          .or(`phone.ilike.%${peerTail}%,phone.ilike.%${peerDigits}%`)
          .limit(1)
          .maybeSingle();
        isInternalMember = !!memberHit;
      }
      if (isCompanyNotifier || isInternalMember) {
        console.log("webhook ignored: internal peer (member/notifier)", JSON.stringify({
          phone, fromMe, isCompanyNotifier, isInternalMember,
        }).slice(0, 300));
        return ok({ ignored: "internal_peer", reason: isCompanyNotifier ? "company_notifier" : "tenant_member" });
      }
    }

    // Fallback: o provedor pode anunciar a mídia (messageType=imageMessage etc.)
    // sem enviar URL nem base64. Nesse caso, baixamos os bytes via API do uazapi
    // usando o messageid. Isso é o que torna anexos enviados pelo WhatsApp nativo
    // (consultor mandando uma foto direto do celular) aparecerem no chat.
    if (media.kind && !media.url && !media.base64 && externalId) {
      try {
        const fetched = await fetchProviderMediaBytes(instance, externalId);
        if (fetched.base64) {
          media.base64 = fetched.base64;
          if (!media.mime) media.mime = fetched.mime;
          if (!media.fileName) media.fileName = fetched.fileName;
          hasMedia = true;
        }
      } catch (e) {
        console.warn("media fallback fetch failed", (e as any)?.message);
      }
    }

    // Timestamp da mensagem (usado para descartar history-sync residual)
    const tsRaw =
      payload?.messageTimestamp ?? payload?.message?.messageTimestamp ??
      payload?.data?.messageTimestamp ?? payload?.t ?? payload?.timestamp ??
      payload?.message?.t ?? payload?.data?.t ?? null;
    let tsMs: number | null = null;
    if (tsRaw != null) {
      const n = Number(tsRaw);
      if (!isNaN(n) && n > 0) tsMs = n < 1e12 ? n * 1000 : n;
    }
    const isOldMessage = !!(tsMs && Date.now() - tsMs > 5 * 60 * 1000);

    const text = rawText ?? (hasMedia ? (media.caption ?? MEDIA_PLACEHOLDER[media.kind!] ?? "📎 Mídia") : "");

    // Debug: se não conseguimos extrair nem texto nem mídia mas o payload tem
    // uma mensagem (não é ack/conexão), logamos as chaves para diagnóstico.
    if (!rawText && !hasMedia && (phone || externalId)) {
      const m = payload?.message ?? payload?.data?.message ?? payload?.data ?? payload;
      const mKeys = m && typeof m === "object" ? Object.keys(m).slice(0, 30) : [];
      console.log("webhook payload undetected", JSON.stringify({
        event: evt,
        fromMe,
        mediaKind: media.kind,
        mediaHasUrl: !!media.url,
        mediaHasB64: !!media.base64,
        externalId,
        messageKeys: mKeys,
      }).slice(0, 800));
    }

    // Persistência "raw" exclusiva do superadmin:
    // grupos, mensagens enviadas pelo próprio número e history-sync residual NÃO
    // viram lead nem disparam IA, mas ficam salvos como conversation sem lead_id.
    // A RLS exige lead_id IS NOT NULL para donos/supervisores, então só o
    // superadmin enxerga esse conteúdo.
    const shouldPersistRawOnly = fromMe || isGroup || isOldMessage;
    if (shouldPersistRawOnly) {
      if (!phone || (!rawText && !hasMedia)) {
        console.log("webhook ignored (raw skip)", JSON.stringify({ fromMe, isGroup, phone, hasText: !!rawText, hasMedia }).slice(0, 500));
        return ok({ ignored: true });
      }
      try {
        // Para mensagens fromMe em DM (não grupo), tente acoplar à conversa do
        // lead existente — assim a resposta do consultor pelo WhatsApp pessoal
        // aparece no thread do lead para toda a equipe, não só para o superadmin.
        let attachedLead: any = null;
        let attachedConv: any = null;
        if (fromMe && !isGroup && phone) {
          const variants = phoneVariants(phone);
          const { data: leadMatch } = await admin
            .from("leads")
            .select("*")
            .eq("tenant_id", instance.tenant_id)
            .in("phone", variants)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (leadMatch) {
            attachedLead = leadMatch;
            const ownerPatch = leadOwnerPatchFromInstance(instance, leadMatch);
            if (Object.keys(ownerPatch).length || !leadMatch.whatsapp_instance_id) {
              const { data: updatedLead } = await admin.from("leads").update({
                ...ownerPatch,
                ...(!leadMatch.whatsapp_instance_id ? { whatsapp_instance_id: instance.id } : {}),
              }).eq("id", leadMatch.id).select("*").single();
              if (updatedLead) attachedLead = updatedLead;
            }
            // Uma única conversa por lead — independente da instância de WhatsApp.
            const { data: convMatches } = await admin
              .from("conversations")
              .select("*")
              .eq("tenant_id", instance.tenant_id)
              .eq("lead_id", leadMatch.id)
              .order("created_at", { ascending: true })
              .limit(1);
            const convMatch = convMatches?.[0] ?? null;
            if (convMatch) {
              const { data: updatedConv } = await admin.from("conversations").update({
                whatsapp_instance_id: instance.id,
                last_message_preview: text.slice(0, 120),
                last_message_at: new Date(tsMs ?? Date.now()).toISOString(),
              }).eq("id", convMatch.id).select("*").single();
              attachedConv = updatedConv ?? convMatch;
            } else {
              const { data: createdConv } = await admin.from("conversations").insert({
                tenant_id: instance.tenant_id,
                lead_id: leadMatch.id,
                whatsapp_instance_id: instance.id,
                last_message_preview: text.slice(0, 120),
                last_message_at: new Date(tsMs ?? Date.now()).toISOString(),
                unread_count: 0,
              }).select("*").single();
              attachedConv = createdConv;
            }
          }
        }

        let convId: string | null = attachedConv?.id ?? null;
        if (!convId) {
          const peerKey = `${isGroup ? "group" : "dm"}:${phone}`;
          let { data: rawConv } = await admin
            .from("conversations")
            .select("*")
            .eq("tenant_id", instance.tenant_id)
            .eq("whatsapp_instance_id", instance.id)
            .is("lead_id", null)
            .filter("metadata->>peer_key", "eq", peerKey)
            .maybeSingle();
          if (!rawConv) {
            const { data: createdRaw } = await admin.from("conversations").insert({
              tenant_id: instance.tenant_id,
              whatsapp_instance_id: instance.id,
              lead_id: null,
              last_message_preview: text.slice(0, 120),
              last_message_at: new Date(tsMs ?? Date.now()).toISOString(),
              unread_count: 0,
              metadata: {
                peer_key: peerKey,
                peer_phone: phone,
                is_group: isGroup,
                push_name: pushName,
                raw_only: true,
              },
            }).select("*").single();
            rawConv = createdRaw;
          } else {
            await admin.from("conversations").update({
              last_message_preview: text.slice(0, 120),
              last_message_at: new Date(tsMs ?? Date.now()).toISOString(),
            }).eq("id", rawConv.id);
          }
          convId = rawConv?.id ?? null;
        }

        let rawMediaUrl: string | null = null;
        let rawMime: string | null = null;
        if (hasMedia && convId) {
          const r = await uploadMediaToStorage(admin, instance, instance.tenant_id, convId, media);
          rawMediaUrl = r.url;
          rawMime = r.mime;
        }
        await admin.from("messages").insert({
          tenant_id: instance.tenant_id,
          conversation_id: convId,
          lead_id: attachedLead?.id ?? null,
          whatsapp_instance_id: instance.id,
          direction: fromMe ? "outbound" : "inbound",
          body: text,
          external_id: externalId,
          message_type: hasMedia ? (media.kind ?? "text") : "text",
          media_url: rawMediaUrl,
          metadata: {
            raw_only: !attachedLead,
            is_group: isGroup,
            from_me: fromMe,
            old_message: isOldMessage,
            push_name: pushName,
            ...(hasMedia ? { media: { kind: media.kind, mime: rawMime ?? media.mime, duration: media.durationSec, file_name: media.fileName, source_url: media.url } } : {}),
          },
        });
      } catch (e) {
        console.error("raw-only persist error", e);
      }
      return ok({ persisted_raw: true, reason: fromMe ? "from_me" : isGroup ? "group" : "old" });
    }


    if (!phone || (!rawText && !hasMedia)) {
      console.log("webhook ignored", JSON.stringify({ fromMe, isGroup, phone, hasText: !!rawText, hasMedia }).slice(0, 500));
      return ok({ ignored: true });
    }


    // Persist lead + message (best-effort)
    let isNewLead = false;
    const variants = phoneVariants(phone);
    const canonical = canonicalPhone(phone);
    let { data: lead } = await admin
      .from("leads")
      .select("*")
      .eq("tenant_id", instance.tenant_id)
      .in("phone", variants)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    // Números marcados como lead de teste (sempre tageados como 'teste' no CRM)
    const TEST_PHONES = ["17997091070", "5517997091070"];
    const phoneDigits = (phone ?? "").replace(/\D/g, "");
    const isTestLead = TEST_PHONES.some((p) => phoneDigits.endsWith(p));

    if (!lead) {
      // POLÍTICA: trabalhamos somente com leads vindos de anúncio/planilha.
      // Telefone desconhecido NÃO vira lead nem conversa — apenas loga e ignora.
      // Isso impede que contatos aleatórios do WhatsApp poluam o CRM.
      console.log("webhook: phone has no matching lead, ignored", { phone: canonical, instance_id: instance.id });
      return ok({ ignored: true, reason: "phone not in lead database" });
    } else {
      const existingTags: string[] = Array.isArray(lead.tags) ? lead.tags : [];
      const needsTestTag = isTestLead && !existingTags.includes("teste");

      const patch: Record<string, any> = { last_message_at: new Date().toISOString() };
      if (lead.phone !== canonical) patch.phone = canonical;
      // Backfill name when it's missing or just a phone-like placeholder
      const currentName = (lead.name ?? "").toString().trim();
      const nameLooksLikePhone = !currentName || /^[\d+\s().-]+$/.test(currentName);
      if (nameLooksLikePhone && pushName) patch.name = pushName;
      if (needsTestTag) patch.tags = [...existingTags, "teste"];
      if (!lead.whatsapp_instance_id) patch.whatsapp_instance_id = instance.id;
      Object.assign(patch, leadOwnerPatchFromInstance(instance, lead));
      const { data: upd } = await admin.from("leads").update(patch).eq("id", lead.id).select("*").single();
      if (upd) lead = upd;
    }

    // Uma única conversa por lead, independente da instância.
    const { data: convRows } = await admin
      .from("conversations")
      .select("*")
      .eq("tenant_id", instance.tenant_id)
      .eq("lead_id", lead!.id)
      .order("created_at", { ascending: true })
      .limit(1);
    let conv: any = convRows?.[0] ?? null;
    if (conv) {
      const { data: updatedConv } = await admin.from("conversations").update({
        whatsapp_instance_id: instance.id,
        last_message_preview: text.slice(0, 120),
        last_message_at: new Date().toISOString(),
        unread_count: (conv.unread_count ?? 0) + 1,
      }).eq("id", conv.id).select("*").single();
      if (updatedConv) conv = updatedConv;
    } else {
      const { data: createdConv, error: insertConvErr } = await admin.from("conversations").insert({
        tenant_id: instance.tenant_id,
        lead_id: lead!.id,
        whatsapp_instance_id: instance.id,
        last_message_preview: text.slice(0, 120),
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      }).select("*").single();
      if (insertConvErr && insertConvErr.code === "23505") {
        const { data: existingRows } = await admin
          .from("conversations")
          .select("*")
          .eq("tenant_id", instance.tenant_id)
          .eq("lead_id", lead!.id)
          .order("created_at", { ascending: true })
          .limit(1);
        conv = existingRows?.[0] ?? null;
      } else {
        conv = createdConv;
      }
    }

    let storedMediaUrl: string | null = null;
    let storedMime: string | null = null;
    if (hasMedia) {
      const r = await uploadMediaToStorage(admin, instance, instance.tenant_id, conv!.id, media);
      storedMediaUrl = r.url;
      storedMime = r.mime;
    }

    await admin.from("messages").insert({
      tenant_id: instance.tenant_id,
      conversation_id: conv!.id,
      lead_id: lead!.id,
      whatsapp_instance_id: instance.id,
      direction: "inbound",
      body: text,
      external_id: externalId,
      message_type: hasMedia ? (media.kind ?? "text") : "text",
      media_url: storedMediaUrl,
      metadata: hasMedia
        ? { media: { kind: media.kind, mime: storedMime ?? media.mime, duration: media.durationSec, file_name: media.fileName, source_url: media.url } }
        : {},
    });

    // Notify a seller (round-robin) only on the very first message of a new lead
    if (isNewLead) {
      await notifySellerRoundRobin(admin, instance, lead, text);
    }

    // Auto-classify lead (temperature + phase + qualification + stage) from full conversation context
    try {
      const { data: msgsForCls } = await admin
        .from("messages")
        .select("direction, body, created_at")
        .eq("conversation_id", conv!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      const clsHistory = (msgsForCls ?? []).reverse().map((m: any) => ({
        from: m.direction === "inbound" ? "client" as const : "loja" as const,
        text: m.body ?? "",
      })).filter((m) => m.text);
      const cls = await classifyLead(clsHistory);
      if (cls && lead) {
        const patch: Record<string, any> = {
          temperature: cls.temperature,
          last_interaction_at: new Date().toISOString(),
        };
        if (cls.lead_phase) patch.lead_phase = cls.lead_phase;
        if (cls.qualification_status) patch.qualification_status = cls.qualification_status;

        // Deriva stage da fase/qualificação (espelha a lógica do front em LeadsPage)
        const phase = cls.lead_phase;
        const qual = cls.qualification_status;
        let derived: string | null = null;
        if (qual === "desqualificado") derived = "perdido";
        else if (phase === "pos_venda") derived = "comprou";
        else if (phase === "fechamento" || phase === "negociacao") derived = "compareceu";
        else if (phase === "simulacao" || phase === "apresentacao") derived = "agendado";
        else if (qual === "qualificado" || qual === "oportunidade_futura") derived = "qualificado";
        else if (qual === "em_qualificacao" || phase === "primeiro_contato") derived = "qualificado";
        else if (cls.stage) derived = cls.stage;

        const currentRank = STAGE_RANK[lead.stage ?? "novo"] ?? 0;
        const newRank = STAGE_RANK[derived ?? "novo"] ?? 0;
        // Permite avançar; só permite regressão para "perdido" se IA detectou desqualificação
        if (derived && (newRank > currentRank || derived === "perdido")) {
          patch.stage = derived;
          if (derived === "comprou") patch.status = "won";
          else if (derived === "perdido") patch.status = "lost";
        }
        if (cls.reasoning) {
          patch.notes = `[IA ${new Date().toLocaleDateString("pt-BR")}] ${cls.reasoning}`;
        }
        await admin.from("leads").update(patch).eq("id", lead.id);
      }
    } catch (e) {
      console.error("auto-classify error", e);
    }

    // Check silence
    const { data: silence } = await admin
      .from("whatsapp_silence")
      .select("silenced_until")
      .eq("tenant_id", instance.tenant_id)
      .eq("whatsapp_instance_id", instance.id)
      .eq("phone", phone)
      .maybeSingle();
    if (silence && new Date(silence.silenced_until).getTime() > Date.now()) {
      return ok({ silenced: true });
    }

    // === REGRA POR CONSULTOR ===
    // Para a Micaelly o pré-atendimento da IA fica restrito à mensagem de
    // boas-vindas (já enviada pela função `send-lead-welcome`, que apresenta
    // a consultora). Nenhuma outra resposta da IA sai no WhatsApp dela.
    // Para os demais consultores, a IA segue o fluxo normal até o consultor
    // assumir enviando a primeira mensagem (humanTyped check abaixo).
    if (lead?.assigned_member_id) {
      const { data: assignedMember } = await admin
        .from("tenant_members")
        .select("display_name")
        .eq("id", lead.assigned_member_id)
        .maybeSingle();
      const memberName = String(assignedMember?.display_name ?? "").toLowerCase();
      if (memberName.includes("micaelly") || memberName.includes("micaely")) {
        console.log("AI skipped: lead atribuído à Micaelly (welcome-only)");
        return ok({ ai_skipped: "micaelly_welcome_only" });
      }
    }




    // Pausa a IA assim que o consultor digitar QUALQUER mensagem na conversa,
    // seja pelo CRM (sent_by != null) ou pelo próprio celular do vendedor
    // (mensagem fromMe que cai como outbound sem metadata.ai). Mensagens
    // marcadas como metadata.ai = true (respostas da própria IA / handoff
    // automatizado) NÃO pausam.
    {
      const { data: humanMsgs } = await admin
        .from("messages")
        .select("id, sent_by, metadata")
        .eq("conversation_id", conv!.id)
        .eq("direction", "outbound")
        .limit(50);
      const humanTyped = (humanMsgs ?? []).some((m: { sent_by: string | null; metadata: { ai?: boolean } | null }) =>
        m.sent_by !== null || !(m.metadata && m.metadata.ai === true)
      );
      if (humanTyped) {
        console.log("AI paused: consultant already typed in this conversation");
        return ok({ assumed_by_human: true });
      }
    }

    // Human handoff detection (literal OR AI-interpreted)
    if (await detectHumanHandoff(text)) {
      const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await admin.from("whatsapp_silence").delete()
        .eq("tenant_id", instance.tenant_id)
        .eq("whatsapp_instance_id", instance.id)
        .eq("phone", phone);
      await admin.from("whatsapp_silence").insert({
        tenant_id: instance.tenant_id,
        whatsapp_instance_id: instance.id,
        phone,
        silenced_until: until,
      });
      const reply = "Claro! Já estou avisando nossa equipe e em instantes um consultor vai te chamar aqui. 👋";
      const providerId = await sendText(instance.server_url, instance.instance_token, phone, reply);
      await admin.from("messages").insert({
        tenant_id: instance.tenant_id, conversation_id: conv!.id, lead_id: lead!.id,
        whatsapp_instance_id: instance.id,
        direction: "outbound", body: reply, external_id: providerId,
        metadata: { ai: true },
      });
      await notifyAllSellersHandoff(admin, instance, lead, text);
      return ok({ handoff: true });
    }

    // Skip AI when message is media-only (audio/image/video) without caption.
    // Transcrição/visão não está implementada — IA não tem como responder de forma útil.
    if (hasMedia && !rawText && !media.caption) {
      return ok({ media_only: true, kind: media.kind });
    }

    // Load tenant AI config
    const { data: aiCfg } = await admin
      .from("ai_config")
      .select("*")
      .eq("tenant_id", instance.tenant_id)
      .maybeSingle();
    if (aiCfg && aiCfg.enabled === false) return ok({ ai_disabled: true });

    // IA só atua em PRÉ-ATENDIMENTO de leads vindos de ANÚNCIO (Meta Ads, Google Ads,
    // Facebook, Instagram, TikTok) ou importados via planilha de anúncios. Leads que
    // chegaram por outras origens (ex.: cliente mandando mensagem orgânica direto no
    // WhatsApp) NÃO devem receber resposta automática da IA — o consultor assume.
    const leadSrc = String(lead?.source ?? "").toLowerCase();
    const isAdLead =
      lead?.imported_from_sheet === true ||
      /ads|anuncio|anúncio|facebook|instagram|meta|tiktok|google[_\s-]?ads/i.test(leadSrc) ||
      isTestLead;
    if (!isAdLead) {
      console.log("AI skipped: lead não é de anúncio (source:", lead?.source, ")");
      return ok({ ai_skipped: "not_ad_lead", source: lead?.source ?? null });
    }


    const { data: tenant } = await admin.from("tenants").select("name").eq("id", instance.tenant_id).maybeSingle();

    // Conta quantas mensagens a IA já enviou nesta conversa. Limite: 5.
    const { data: aiMsgs } = await admin
      .from("messages")
      .select("id, metadata")
      .eq("conversation_id", conv!.id)
      .eq("direction", "outbound")
      .limit(100);
    const aiTurnsSoFar = (aiMsgs ?? []).filter((m: any) => m?.metadata?.ai === true).length;
    const MAX_AI_TURNS = 5;
    if (aiTurnsSoFar >= MAX_AI_TURNS) {
      console.log("AI limit reached (5 msgs); handing off to human");
      await notifyAllSellersHandoff(admin, instance, lead, text);
      return ok({ ai_limit_reached: true, turns: aiTurnsSoFar });
    }
    const isLastTurn = aiTurnsSoFar === MAX_AI_TURNS - 1;

    const fullPrompt = await buildKnowledgePrompt(admin, instance.tenant_id, tenant?.name, aiCfg, isNewLead, aiTurnsSoFar, isLastTurn);

    // Build short history for context (last 10 messages, excluding current inbound)
    const { data: recentMsgs } = await admin
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", conv!.id)
      .order("created_at", { ascending: false })
      .limit(11);
    const historyMsgs = (recentMsgs ?? [])
      .reverse()
      .slice(0, -1) // remove the just-inserted inbound
      .map((m: any) => ({
        role: m.direction === "inbound" ? "user" as const : "assistant" as const,
        content: m.body ?? "",
      }))
      .filter((m: any) => m.content);

    const reply = await callAIWithHistory(fullPrompt, historyMsgs, text);
    if (!reply || !reply.trim()) {
      console.log("AI returned empty reply; skipping send to lead");
      return ok({ skipped: "empty_ai_reply" });
    }
    // Delay humano: 1s de "lendo" + ~40ms por caractere digitando (entre 3s e 12s)
    const typingMs = Math.min(12000, Math.max(3000, 1000 + reply.length * 40));
    await new Promise((r) => setTimeout(r, typingMs));
    const providerId = await sendText(instance.server_url, instance.instance_token, phone, reply);
    await admin.from("messages").insert({
      tenant_id: instance.tenant_id, conversation_id: conv!.id, lead_id: lead!.id,
      whatsapp_instance_id: instance.id,
      direction: "outbound", body: reply, external_id: providerId,
      metadata: { ai: true },
    });

    // Se foi a última mensagem permitida da IA, notifica consultores para assumirem.
    if (isLastTurn) {
      try { await notifyAllSellersHandoff(admin, instance, lead, text); } catch (e) { console.error("handoff notify failed", e); }
    }


    // Detecta agendamento confirmado e cria automaticamente na agenda
    try {
      const { data: recent } = await admin
        .from("messages")
        .select("direction, body, created_at")
        .eq("conversation_id", conv!.id)
        .order("created_at", { ascending: false })
        .limit(12);
      const history = (recent ?? []).reverse().map((m: any) => ({
        from: m.direction === "inbound" ? "client" as const : "loja" as const,
        text: m.body ?? "",
        at: m.created_at,
      }));
      // inclui a resposta recém-enviada (ainda pode não estar persistida na query acima por timing)
      history.push({ from: "loja", text: reply, at: new Date().toISOString() });

      const appt = await extractAppointment(history);
      if (appt?.has && appt.iso) {
        // Evita duplicar: já existe agendamento desse lead em ±2h dessa data?
        const target = new Date(appt.iso);
        const winStart = new Date(target.getTime() - 2 * 60 * 60 * 1000).toISOString();
        const winEnd = new Date(target.getTime() + 2 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin
          .from("appointments")
          .select("id")
          .eq("lead_id", lead!.id)
          .gte("scheduled_at", winStart)
          .lte("scheduled_at", winEnd)
          .maybeSingle();
        if (!existing) {
          await admin.from("appointments").insert({
            tenant_id: instance.tenant_id,
            lead_id: lead!.id,
            scheduled_at: target.toISOString(),
            duration_minutes: 30,
            type: appt.type ?? "consulta",
            status: "agendado",
            notes: `Criado automaticamente pela IA via WhatsApp. ${appt.reasoning ?? ""}`.trim(),
          });
          // Move o lead para o stage "agendado"
          await admin.from("leads").update({
            stage: "agendado",
            last_interaction_at: new Date().toISOString(),
          }).eq("id", lead!.id);
          console.log("appointment auto-created", { lead: lead!.id, at: target.toISOString() });
        }
      }
    } catch (e) {
      console.error("auto-appointment error", e);
    }

    return ok({ replied: true });
  } catch (e: any) {
    console.error("webhook error", e);
    return ok({ error: e?.message ?? "erro" }, 200); // 200 to prevent provider retries storm
  }
});