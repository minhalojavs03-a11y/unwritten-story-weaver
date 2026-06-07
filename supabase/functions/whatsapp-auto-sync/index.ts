// Auto-sync recorrente: a cada 2 minutos, varre todas as instâncias conectadas
// e chama a ação `sync-history` da função `whatsapp-manage` para puxar mensagens
// recentes do provedor (cobre eventos perdidos pelo webhook).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(b: unknown = { ok: true }, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const url = new URL(req.url);
    const maxChats = Number(url.searchParams.get("max_chats") ?? "60");
    const msgsPerChat = Number(url.searchParams.get("msgs_per_chat") ?? "15");

    // Pega todas instâncias conectadas
    const { data: instances, error } = await admin
      .from("whatsapp_instances")
      .select("id, tenant_id, instance_name, is_connected, status, server_url, instance_token")
      .or("is_connected.eq.true,status.eq.connected");
    if (error) throw error;

    const connected = (instances ?? []).filter(
      (i) => (i.is_connected || i.status === "connected") && i.server_url && i.instance_token,
    );
    console.log(`[whatsapp-auto-sync] connected instances=${connected.length}`);

    const runner = async () => {
      let okCount = 0, errCount = 0;
      for (const inst of connected) {
        try {
          // Chama whatsapp-manage com service-role -> precisa de admin-sync-history,
          // mas para simplificar invocamos diretamente a função interna usando
          // service-role via PostgREST: copiamos a lógica do sync chamando o webhook.
          // Em vez disso, chamamos a edge whatsapp-manage com action sync-history
          // usando o service role como Authorization (ela aceita admin-sync-history
          // só com service-role). Para reaproveitar o caminho que já existe, fazemos
          // um POST autenticado como service-role usando o header apikey + Authorization.
          const r = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-manage`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SERVICE_ROLE}`,
              "apikey": SERVICE_ROLE,
            },
            body: JSON.stringify({
              action: "admin-sync-history",
              tenant_id: inst.tenant_id,
              instance_id: inst.id,
              maxChats,
              msgsPerChat,
            }),
          });
          const txt = await r.text().catch(() => "");
          if (!r.ok) {
            errCount++;
            console.error(`[whatsapp-auto-sync] instance=${inst.id} status=${r.status} body=${txt.slice(0, 300)}`);
          } else {
            okCount++;
            console.log(`[whatsapp-auto-sync] instance=${inst.id} ok ${txt.slice(0, 200)}`);
          }
        } catch (e) {
          errCount++;
          console.error(`[whatsapp-auto-sync] instance=${inst.id} threw`, e);
        }
      }
      console.log(`[whatsapp-auto-sync] DONE ok=${okCount} err=${errCount}`);
    };

    // Roda em background para responder rápido ao cron
    // @ts-ignore EdgeRuntime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner());
    } else {
      runner();
    }

    return ok({ started: true, instances: connected.length });
  } catch (e) {
    console.error("[whatsapp-auto-sync] fatal", e);
    return ok({ error: String(e) }, 500);
  }
});
