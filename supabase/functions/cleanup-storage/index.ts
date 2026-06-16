// Cleanup de mídias antigas no Storage.
// - Apaga apenas arquivos com mais de N dias (default 30).
// - NUNCA apaga mensagens/conversas/leads do banco — só o arquivo binário.
// - Dois modos de chamada:
//   1) Cron: header `x-cron-secret` == CRON_SECRET (sem JWT de usuário).
//   2) Manual: usuário autenticado com role superadmin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = !!CRON_SECRET && cronSecret === CRON_SECRET;

    // Auth: cron-secret OU superadmin
    if (!isCron) {
      const auth = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "unauth" }, 401);

      const adminAuth = createClient(SUPABASE_URL, SERVICE);
      const { data: isSuper } = await adminAuth.rpc("has_app_role", { _user_id: u.user.id, _role: "superadmin" });
      if (!isSuper) return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const buckets: string[] = Array.isArray(body?.buckets) && body.buckets.length
      ? body.buckets
      : [body?.bucket ?? "chat-media"];
    const olderThanDays: number = Number(body?.older_than_days ?? 30);
    const maxBatches: number = Number(body?.max_batches ?? 50);
    const dryRun: boolean = body?.dry_run === true;

    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      return json({ error: "older_than_days deve ser >= 1" }, 400);
    }

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const admin = createClient(SUPABASE_URL, SERVICE);

    const results: Record<string, { deleted: number; scanned: number; errors: string[] }> = {};

    for (const bucket of buckets) {
      const stat = { deleted: 0, scanned: 0, errors: [] as string[] };
      results[bucket] = stat;

      for (let i = 0; i < maxBatches; i++) {
        // Lista direto da tabela storage.objects com filtro de idade.
        // Usa Accept-Profile=storage para mirar no schema correto via PostgREST.
        const url = `${SUPABASE_URL}/rest/v1/objects?select=name,created_at`
          + `&bucket_id=eq.${encodeURIComponent(bucket)}`
          + `&created_at=lt.${encodeURIComponent(cutoff)}`
          + `&order=created_at.asc&limit=1000`;

        const res = await fetch(url, {
          headers: {
            apikey: SERVICE,
            Authorization: `Bearer ${SERVICE}`,
            "Accept-Profile": "storage",
          },
        });
        if (!res.ok) {
          stat.errors.push(`list failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
          break;
        }
        const rows = await res.json() as Array<{ name: string; created_at: string }>;
        if (!rows.length) break;
        stat.scanned += rows.length;

        const names = rows.map((r) => r.name);
        if (dryRun) {
          stat.deleted += names.length;
        } else {
          const { error: delErr } = await admin.storage.from(bucket).remove(names);
          if (delErr) {
            stat.errors.push(delErr.message);
            break;
          }
          stat.deleted += names.length;
        }
        if (names.length < 1000) break;
      }
    }

    return json({
      ok: true,
      mode: isCron ? "cron" : "manual",
      older_than_days: olderThanDays,
      cutoff,
      dry_run: dryRun,
      results,
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
