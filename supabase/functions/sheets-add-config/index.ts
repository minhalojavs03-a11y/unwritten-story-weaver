// One-shot helper: reads sheet headers, detects column letters,
// and creates a sheet_sync_config row for the given tenant.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY")!;

function indexToLetter(i: number): string {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function norm(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { sheet_url, tenant_id, tab_name = "Sheet1" } = await req.json();

    const m = String(sheet_url).match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) throw new Error("invalid sheet_url");
    const sheet_id = m[1];

    // 1) Get metadata to discover actual sheet/tab names
    const metaUrl = `${GATEWAY}/spreadsheets/${sheet_id}?includeGridData=false`;
    const metaRes = await fetch(metaUrl, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
      },
    });
    if (!metaRes.ok) throw new Error(`meta ${metaRes.status}: ${(await metaRes.text()).slice(0, 200)}`);
    const meta = await metaRes.json();
    const tabs: string[] = (meta.sheets || []).map((s: any) => s.properties.title);
    const useTab = tabs.includes(tab_name) ? tab_name : tabs[0];

    // 2) Read first row (headers)
    const range = `${useTab}!1:1`;
    const valRes = await fetch(`${GATEWAY}/spreadsheets/${sheet_id}/values/${range}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
      },
    });
    if (!valRes.ok) throw new Error(`values ${valRes.status}: ${(await valRes.text()).slice(0, 200)}`);
    const data = await valRes.json();
    const headers: string[] = (data.values?.[0] || []).map((h: any) => String(h || ""));
    const normHeaders = headers.map(norm);

    function findCol(...candidates: string[]): string | null {
      for (const c of candidates) {
        const i = normHeaders.findIndex((h) => h === c || h.includes(c));
        if (i >= 0) return indexToLetter(i);
      }
      return null;
    }

    const mapping = {
      nome: findCol("nome_completo", "nome", "full_name", "name"),
      telefone: findCol("numero_do_whatsapp", "whatsapp", "telefone", "phone", "celular"),
      email: findCol("email", "e_mail"),
      interesse: findCol(
        "qual_e_o_valor_de_credito_que_voce_precisa_para_comprar_o_seu_imovel",
        "valor_de_credito",
        "credito",
        "valor",
        "interesse",
      ),
    };

    const insertBody = {
      tenant_id,
      sheet_url,
      sheet_id,
      tab_name: useTab,
      is_active: true,
      header_row: 1,
      last_row_synced: 1,
      column_mapping: mapping,
      notify_vendors: true,
    };

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/sheet_sync_config`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertBody),
    });
    const insBody = await ins.text();
    if (!ins.ok) throw new Error(`insert ${ins.status}: ${insBody.slice(0, 300)}`);

    return new Response(
      JSON.stringify({ ok: true, headers, mapping, tab: useTab, config: JSON.parse(insBody) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
