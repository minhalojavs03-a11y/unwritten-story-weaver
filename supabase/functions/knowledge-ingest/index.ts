import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function pickField(row: Record<string, any>, keys: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, any> = {};
  for (const k of Object.keys(row)) map[norm(k)] = row[k];
  for (const k of keys) {
    const v = map[norm(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function parsePrice(s: string | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

function rowsFromCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return ok({ error: "no auth" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return ok({ error: "unauth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: prof } = await admin.from("profiles").select("tenant_id").eq("id", u.user.id).maybeSingle();
    const tenantId = prof?.tenant_id;
    if (!tenantId) return ok({ error: "no tenant" }, 400);

    const { storage_path, name, mime_type, kind, size_bytes, import_products } = await req.json();
    if (!storage_path) return ok({ error: "storage_path required" }, 400);

    // Download file
    const dl = await admin.storage.from("knowledge").download(storage_path);
    if (dl.error || !dl.data) return ok({ error: "download failed" }, 500);
    const buf = new Uint8Array(await dl.data.arrayBuffer());

    let extractedText = "";
    let rows: Record<string, any>[] = [];
    const lcName = (name ?? "").toLowerCase();
    const isImage = (mime_type ?? "").startsWith("image/");

    if (!isImage) {
      try {
        if (lcName.endsWith(".csv")) {
          extractedText = new TextDecoder().decode(buf);
          rows = rowsFromCsv(extractedText);
        } else if (lcName.endsWith(".txt") || (mime_type ?? "").startsWith("text/")) {
          extractedText = new TextDecoder().decode(buf);
        } else if (lcName.endsWith(".xlsx") || lcName.endsWith(".xls") || lcName.endsWith(".ods")) {
          const wb = XLSX.read(buf, { type: "array" });
          for (const sn of wb.SheetNames) {
            const sheet = wb.Sheets[sn];
            const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
            rows.push(...json);
            extractedText += `\n--- ${sn} ---\n` + XLSX.utils.sheet_to_csv(sheet);
          }
        } else {
          // Fallback: try as text
          try { extractedText = new TextDecoder().decode(buf); } catch { /* ignore */ }
        }
      } catch (e) {
        console.error("parse error", e);
      }
    }

    // Insert knowledge_files row
    const { data: kf, error: kfErr } = await admin.from("knowledge_files").insert({
      tenant_id: tenantId,
      kind: isImage ? "image" : (import_products && rows.length ? "product_list" : "document"),
      name: name ?? storage_path.split("/").pop(),
      storage_path,
      mime_type,
      size_bytes,
      extracted_text: extractedText.slice(0, 50000) || null,
      created_by: u.user.id,
    }).select("*").single();
    if (kfErr) console.error("kf insert", kfErr);

    // Optional: import as products
    let imported = 0;
    if (import_products && rows.length) {
      const products = rows.map((r) => {
        const nameVal = pickField(r, ["nome", "produto", "descricao", "descrição", "name", "title"]);
        if (!nameVal) return null;
        return {
          tenant_id: tenantId,
          name: nameVal.slice(0, 200),
          brand: pickField(r, ["marca", "brand", "fabricante"]),
          category: pickField(r, ["categoria", "tipo", "category"]),
          price: parsePrice(pickField(r, ["preco", "preço", "valor", "price"])),
          stock: parseInt(pickField(r, ["estoque", "qtd", "quantidade", "stock"]) ?? "0", 10) || 0,
          active: true,
        };
      }).filter(Boolean) as any[];
      if (products.length) {
        // Insert in batches of 200
        for (let i = 0; i < products.length; i += 200) {
          const slice = products.slice(i, i + 200);
          const { error } = await admin.from("products").insert(slice);
          if (!error) imported += slice.length;
          else console.error("products insert", error);
        }
      }
    }

    return ok({ ok: true, file: kf, imported_products: imported, parsed_rows: rows.length });
  } catch (e: any) {
    console.error("ingest error", e);
    return ok({ error: e?.message ?? "erro" }, 500);
  }
});