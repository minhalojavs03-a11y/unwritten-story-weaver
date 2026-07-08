// Edge function: fetch-album-images
// Fetches the actual image bytes for an "Album: N images" WhatsApp message that
// uazapi delivered only as a text placeholder. Calls the provider's /message/find
// to list recent messages on the chat, picks images that arrived within a small
// window around the album text, and inserts them as proper image rows in our
// `messages` table so the conversation UI can render them.
//
// Body: { message_id: string }  // uuid of the album text message in our DB

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function toDataUrl(base64: string | null | undefined, mime: string | null | undefined): string | null {
  if (!base64) return null;
  const compact = base64.replace(/\s+/g, "");
  if (compact.startsWith("data:")) return compact;
  const m = mime && mime.startsWith("image/") ? mime : "image/jpeg";
  return `data:${m};base64,${compact}`;
}

function extractBase64(item: any): { base64: string | null; mime: string | null } {
  const base64: string | null =
    item?.base64 ??
    item?.fileBase64 ??
    item?.media ??
    item?.image ??
    item?.content?.base64 ??
    item?.data?.base64 ??
    item?.message?.imageMessage?.jpegThumbnail ??
    null;
  const mime: string | null =
    item?.mimetype ?? item?.mimeType ?? item?.contentType ?? item?.message?.imageMessage?.mimetype ?? null;
  return { base64, mime };
}

function isImageItem(item: any): boolean {
  const t = String(
    item?.messageType ?? item?.type ?? item?.mediaType ?? item?.message?.imageMessage ? "image" : ""
  ).toLowerCase();
  if (t.includes("image") || t === "photo") return true;
  const mt = String(item?.mimetype ?? item?.mimeType ?? "").toLowerCase();
  if (mt.startsWith("image/")) return true;
  if (item?.message?.imageMessage) return true;
  return false;
}

function itemTimestampMs(item: any): number | null {
  const t =
    item?.messageTimestamp ??
    item?.timestamp ??
    item?.messageTimestampMs ??
    item?.t ??
    item?.created_at ??
    null;
  if (t == null) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) {
    const d = Date.parse(String(t));
    return Number.isFinite(d) ? d : null;
  }
  // uazapi often returns seconds
  return n < 1e12 ? n * 1000 : n;
}

function itemExternalId(item: any): string | null {
  return item?.messageid ?? item?.id ?? item?.key?.id ?? item?.message?.key?.id ?? null;
}

async function uazapiFind(serverUrl: string, token: string, chatid: string): Promise<any[]> {
  // uazapi frequentemente exige limit alto para alcançar álbuns antigos.
  // Alguns deployments filtram por `messageType: "image"`. Agregamos por id.
  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    { url: `${serverUrl}/message/find`, body: { chatid, limit: 1000, messageType: "image" } },
    { url: `${serverUrl}/message/find`, body: { chatid, limit: 1000 } },
    { url: `${serverUrl}/message/find`, body: { chatId: chatid, limit: 1000 } },
    { url: `${serverUrl}/message/find`, body: { number: chatid, limit: 1000 } },
    { url: `${serverUrl}/chat/findMessages`, body: { chatid, limit: 1000 } },
  ];
  const acc = new Map<string, any>();
  for (const a of attempts) {
    try {
      const r = await fetch(a.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(a.body),
      });
      if (!r.ok) continue;
      const data = await r.json().catch(() => null);
      const arr =
        (Array.isArray(data) && data) ||
        data?.messages ||
        data?.data?.messages ||
        data?.result ||
        data?.data ||
        [];
      if (Array.isArray(arr)) {
        for (const it of arr) {
          const key = itemExternalId(it) ?? JSON.stringify(it).slice(0, 80);
          if (!acc.has(key)) acc.set(key, it);
        }
      }
    } catch (_e) { /* try next */ }
  }
  return Array.from(acc.values());
}

async function uazapiDownload(serverUrl: string, token: string, externalId: string): Promise<{ base64: string | null; mime: string | null }> {
  const endpoints = [
    { url: `${serverUrl}/message/download`, body: { messageid: externalId } },
    { url: `${serverUrl}/message/download`, body: { id: externalId } },
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(ep.body),
      });
      if (!r.ok) continue;
      const d = await r.json().catch(() => null);
      if (!d) continue;
      const base64 = d?.base64 ?? d?.fileBase64 ?? d?.data?.base64 ?? d?.media ?? null;
      const mime = d?.mimetype ?? d?.mimeType ?? d?.contentType ?? null;
      if (base64) return { base64, mime };
    } catch (_e) { /* try next */ }
  }
  return { base64: null, mime: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { message_id } = await req.json().catch(() => ({}));
    if (!message_id || typeof message_id !== "string") {
      return json({ error: "message_id obrigatório" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: albumMsg, error: msgErr } = await admin
      .from("messages")
      .select("id, tenant_id, conversation_id, lead_id, body, external_id, created_at, whatsapp_instance_id, metadata")
      .eq("id", message_id)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!albumMsg) return json({ error: "message não encontrada" }, 404);

    // Idempotency: if we already fetched, skip
    const alreadyFetched = (albumMsg.metadata as any)?.album_fetched === true;

    const { data: conv } = await admin
      .from("conversations")
      .select("id, whatsapp_instance_id, lead_id, tenant_id")
      .eq("id", albumMsg.conversation_id)
      .maybeSingle();

    const { data: lead } = await admin
      .from("leads")
      .select("id, phone, name")
      .eq("id", albumMsg.lead_id)
      .maybeSingle();

    const instanceId = albumMsg.whatsapp_instance_id ?? conv?.whatsapp_instance_id;
    if (!instanceId) return json({ error: "instância não vinculada" }, 400);

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("id, server_url, instance_token")
      .eq("id", instanceId)
      .maybeSingle();
    if (!instance?.server_url || !instance?.instance_token) {
      return json({ error: "instância sem credenciais" }, 400);
    }

    const phoneDigits = String(lead?.phone ?? "").replace(/\D/g, "");
    if (!phoneDigits) return json({ error: "lead sem telefone" }, 400);
    const chatid = `${phoneDigits}@s.whatsapp.net`;

    // Pull recent messages from provider
    let items = await uazapiFind(instance.server_url, instance.instance_token, chatid);
    if (!items.length) {
      // Fallback: try with @c.us variant
      items = await uazapiFind(instance.server_url, instance.instance_token, `${phoneDigits}@c.us`);
    }

    const albumTimeMs = new Date(albumMsg.created_at as any).getTime();
    // Janela ampla: uazapi pode devolver timestamps em segundos e álbuns antigos
    // podem estar deslocados. 6h cobre folga de fuso/atraso sem misturar dias.
    const windowMs = 6 * 60 * 60 * 1000;

    // Filter image items close in time to the album text
    const candidates = items
      .filter((it) => isImageItem(it))
      .filter((it) => {
        const ts = itemTimestampMs(it);
        return ts == null ? true : Math.abs(ts - albumTimeMs) <= windowMs;
      });

    // Existing external_ids to avoid duplicates
    const externalIds = candidates.map(itemExternalId).filter(Boolean) as string[];
    let existing = new Set<string>();
    if (externalIds.length) {
      const { data: existRows } = await admin
        .from("messages")
        .select("external_id")
        .eq("conversation_id", albumMsg.conversation_id)
        .in("external_id", externalIds);
      existing = new Set((existRows ?? []).map((r: any) => r.external_id));
    }

    const inserts: any[] = [];
    for (const it of candidates) {
      const extId = itemExternalId(it);
      if (extId && existing.has(extId)) continue;

      let { base64, mime } = extractBase64(it);
      if (!base64 && extId) {
        const got = await uazapiDownload(instance.server_url, instance.instance_token, extId);
        base64 = got.base64;
        mime = got.mime ?? mime;
      }
      const dataUrl = toDataUrl(base64, mime);
      if (!dataUrl) continue;

      const ts = itemTimestampMs(it);
      const createdAt = ts ? new Date(ts).toISOString() : new Date(albumTimeMs + inserts.length).toISOString();

      inserts.push({
        tenant_id: albumMsg.tenant_id,
        conversation_id: albumMsg.conversation_id,
        lead_id: albumMsg.lead_id,
        whatsapp_instance_id: instanceId,
        direction: "inbound",
        message_type: "image",
        body: it?.caption ?? null,
        content: null,
        media_url: dataUrl,
        status: "received",
        external_id: extId,
        metadata: { source: "album_fetch", album_parent_id: albumMsg.id, mime: mime ?? "image/jpeg" },
        created_at: createdAt,
      });
    }

    let inserted = 0;
    if (inserts.length) {
      const { error: insErr, count } = await admin
        .from("messages")
        .insert(inserts, { count: "exact" });
      if (insErr) throw insErr;
      inserted = count ?? inserts.length;
    }

    // Só marca como concluído quando REALMENTE inserimos imagens.
    // Se veio 0, mantemos album_fetched=false para permitir novas tentativas
    // (a UI mostra "Tentar novamente" nesse caso).
    const newMeta: Record<string, unknown> = {
      ...(albumMsg.metadata as any || {}),
      album_last_attempt_at: new Date().toISOString(),
      album_fetched_count: ((albumMsg.metadata as any)?.album_fetched_count ?? 0) + inserted,
      album_candidates_last: candidates.length,
      album_items_last: items.length,
    };
    if (inserted > 0) {
      newMeta.album_fetched = true;
      newMeta.album_fetched_at = new Date().toISOString();
    } else {
      newMeta.album_fetched = false;
    }
    await admin
      .from("messages")
      .update({ metadata: newMeta })
      .eq("id", albumMsg.id);

    return json({
      ok: true,
      inserted,
      candidates: candidates.length,
      items: items.length,
      already_fetched: alreadyFetched,
    });
  } catch (e: any) {
    console.error("fetch-album-images error", e);
    return json({ error: e?.message ?? "erro" }, 500);
  }
});
