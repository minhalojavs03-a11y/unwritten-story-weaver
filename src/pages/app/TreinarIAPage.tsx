import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useAiConfig, useUpdateAiConfig } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Upload, FileText, Image as ImageIcon, Sparkles, Package } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const WEEKDAYS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

export default function TreinarIAPage() {
  const { tenantId, isOwner } = useAuth();
  const { data: ai } = useAiConfig();
  const updateAi = useUpdateAiConfig();
  const qc = useQueryClient();

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (ai) setForm(ai); }, [ai]);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function saveBusiness() {
    try {
      await updateAi.mutateAsync({
        enabled: form.enabled, tone: form.tone, system_prompt: form.system_prompt,
        business_description: form.business_description, address: form.address,
        phone: form.phone, whatsapp: form.whatsapp, website: form.website,
        payment_methods: form.payment_methods, insurance_plans: form.insurance_plans,
        services: form.services, differentials: form.differentials, extra_notes: form.extra_notes,
      });
      toast({ title: "Informações salvas", description: "A IA já está usando esses dados." });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader title="Treinar IA" subtitle="Ensine seu assistente sobre o negócio, produtos, horários e mais" />
      <div className="space-y-4 p-3 md:max-w-5xl md:space-y-6 md:p-8">
        <Tabs defaultValue="negocio">
          <TabsList className="flex w-full flex-wrap gap-1 overflow-x-auto">
            <TabsTrigger value="negocio">Negócio</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="faqs">FAQs</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="galeria">Galeria</TabsTrigger>
            <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          </TabsList>

          {/* NEGÓCIO */}
          <TabsContent value="negocio" className="mt-4 space-y-4">
            <section className="rounded-xl border bg-card p-4 md:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold md:text-lg">Sobre o seu negócio</h2>
                  <p className="text-xs text-muted-foreground">Quanto mais detalhes você der, melhor a IA responde.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">IA ativa</Label>
                  <Switch checked={!!form.enabled} onCheckedChange={(v) => set("enabled", v)} disabled={!isOwner} />
                </div>
              </div>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label>Descrição do negócio</Label>
                  <Textarea rows={3} placeholder="Ex: Administradora de consórcios há 15 anos, especializada em cartas de crédito para imóvel, automóvel e serviços, com parcelas reduzidas e contemplação por lance ou sorteio." value={form.business_description ?? ""} onChange={(e) => set("business_description", e.target.value)} disabled={!isOwner} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Endereço" v={form.address} onChange={(v) => set("address", v)} disabled={!isOwner} />
                  <Field label="Site" v={form.website} onChange={(v) => set("website", v)} disabled={!isOwner} />
                  <Field label="Telefone" v={form.phone} onChange={(v) => set("phone", v)} disabled={!isOwner} />
                  <Field label="WhatsApp" v={form.whatsapp} onChange={(v) => set("whatsapp", v)} disabled={!isOwner} />
                </div>
                <Area label="Tipos de consórcio / segmentos" placeholder="Ex: Consórcio de imóvel (casa, apartamento, terreno), automóvel (carro, moto, caminhão), serviços (viagem, reforma, cirurgia)…" v={form.services} onChange={(v) => set("services", v)} disabled={!isOwner} />
                <Area label="Administradoras parceiras / grupos" placeholder="Ex: Porto Seguro, Itaú, HS, Embracon, Âncora…" v={form.insurance_plans} onChange={(v) => set("insurance_plans", v)} disabled={!isOwner} />
                <Area label="Formas de pagamento da parcela" placeholder="Pix, boleto, débito automático, cartão de crédito…" v={form.payment_methods} onChange={(v) => set("payment_methods", v)} disabled={!isOwner} />
                <Area label="Diferenciais" placeholder="O que torna sua administradora única (taxa, prazo, atendimento, contemplação rápida...)" v={form.differentials} onChange={(v) => set("differentials", v)} disabled={!isOwner} />
                <Area label="Observações para a IA" placeholder="Ex: Sempre ofereça uma simulação personalizada. Nunca confirme valor exato de parcela sem consultar o consultor." v={form.extra_notes} onChange={(v) => set("extra_notes", v)} disabled={!isOwner} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tom da conversa</Label>
                    <select value={form.tone ?? "amigavel"} onChange={(e) => set("tone", e.target.value)} disabled={!isOwner} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="amigavel">Amigável</option>
                      <option value="profissional">Profissional</option>
                      <option value="casual">Casual</option>
                    </select>
                  </div>
                </div>
                <Area label="Instruções adicionais (avançado)" placeholder="Regras específicas que a IA deve seguir" v={form.system_prompt} onChange={(v) => set("system_prompt", v)} disabled={!isOwner} rows={4} />
              </div>
              {isOwner && (
                <div className="mt-4">
                  <Button onClick={saveBusiness} disabled={updateAi.isPending}>
                    {updateAi.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Salvar e treinar IA
                  </Button>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="horarios" className="mt-4"><HoursSection tenantId={tenantId} disabled={!isOwner} /></TabsContent>
          <TabsContent value="faqs" className="mt-4"><FaqsSection tenantId={tenantId} disabled={!isOwner} /></TabsContent>
          <TabsContent value="produtos" className="mt-4"><ProductsSection /></TabsContent>
          <TabsContent value="galeria" className="mt-4"><GallerySection disabled={!isOwner} /></TabsContent>
          <TabsContent value="arquivos" className="mt-4"><FilesSection disabled={!isOwner} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Field({ label, v, onChange, disabled }: any) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={v ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} /></div>;
}
function Area({ label, v, onChange, disabled, rows = 3, placeholder }: any) {
  return <div className="space-y-1.5"><Label>{label}</Label><Textarea rows={rows} placeholder={placeholder} value={v ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} /></div>;
}

/* HORÁRIOS */
function HoursSection({ tenantId, disabled }: { tenantId: string | null; disabled: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["business_hours", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*").order("weekday");
      if (error) throw error;
      return data ?? [];
    },
  });
  const byDay = useMemo(() => {
    const m: Record<number, any> = {};
    (data ?? []).forEach((r: any) => { m[r.weekday] = r; });
    return m;
  }, [data]);

  async function saveDay(weekday: number, patch: any) {
    if (!tenantId) return;
    const existing = byDay[weekday];
    const row = { tenant_id: tenantId, weekday, ...existing, ...patch };
    const { error } = await supabase.from("business_hours").upsert(row, { onConflict: "tenant_id,weekday" });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["business_hours"] });
  }

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="mb-4 font-display text-base font-semibold md:text-lg">Horário de funcionamento</h2>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-2">
          {WEEKDAYS.map((label, i) => {
            const r = byDay[i] ?? { open_time: "09:00", close_time: "18:00", closed: false };
            return (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="w-24 font-medium">{label}</div>
                <div className="flex items-center gap-2 text-sm">
                  <Switch checked={!r.closed} onCheckedChange={(v) => saveDay(i, { closed: !v, open_time: r.open_time ?? "09:00", close_time: r.close_time ?? "18:00" })} disabled={disabled} />
                  <span className="text-muted-foreground">{r.closed ? "Fechado" : "Aberto"}</span>
                </div>
                {!r.closed && (
                  <div className="flex items-center gap-2">
                    <Input type="time" className="w-28" value={r.open_time ?? ""} onChange={(e) => saveDay(i, { open_time: e.target.value, close_time: r.close_time ?? "18:00", closed: false })} disabled={disabled} />
                    <span className="text-muted-foreground">às</span>
                    <Input type="time" className="w-28" value={r.close_time ?? ""} onChange={(e) => saveDay(i, { close_time: e.target.value, open_time: r.open_time ?? "09:00", closed: false })} disabled={disabled} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* FAQs */
function FaqsSection({ tenantId, disabled }: { tenantId: string | null; disabled: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [a, setA] = useState("");
  const { data } = useQuery({
    queryKey: ["faqs", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("faqs").select("*").order("position");
      if (error) throw error; return data ?? [];
    },
  });
  async function add() {
    if (!tenantId || !q.trim() || !a.trim()) return;
    const { error } = await supabase.from("faqs").insert({ tenant_id: tenantId, question: q.trim(), answer: a.trim(), position: (data?.length ?? 0) });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setQ(""); setA(""); qc.invalidateQueries({ queryKey: ["faqs"] });
  }
  async function del(id: string) {
    await supabase.from("faqs").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["faqs"] });
  }
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="mb-4 font-display text-base font-semibold md:text-lg">Perguntas frequentes</h2>
      {!disabled && (
        <div className="mb-4 space-y-2 rounded-lg border bg-muted/20 p-3">
          <Input placeholder="Pergunta (ex: Qual o prazo do consórcio de imóvel?)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Textarea rows={2} placeholder="Resposta" value={a} onChange={(e) => setA(e.target.value)} />
          <Button size="sm" onClick={add}><Plus className="mr-2 h-4 w-4" />Adicionar FAQ</Button>
        </div>
      )}
      <div className="space-y-2">
        {data?.map((f: any) => (
          <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="min-w-0">
              <div className="font-medium">{f.question}</div>
              <div className="text-sm text-muted-foreground">{f.answer}</div>
            </div>
            {!disabled && <Button size="icon" variant="ghost" onClick={() => del(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </div>
        ))}
        {!data?.length && <p className="text-sm text-muted-foreground">Nenhuma FAQ ainda.</p>}
      </div>
    </section>
  );
}

/* PRODUTOS */
function ProductsSection() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error; return data ?? [];
    },
  });
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold md:text-lg">Produtos</h2>
        <span className="text-xs text-muted-foreground">{products?.length ?? 0} cadastrados</span>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Use a aba <strong>Arquivos</strong> para importar uma planilha Excel/CSV. Colunas reconhecidas: <code>nome, marca, categoria, preço, estoque</code>.</p>
      <div className="max-h-[420px] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Nome</th><th className="p-2">Marca</th><th className="p-2">Categoria</th><th className="p-2 text-right">Preço</th><th className="p-2 text-right">Estoque</th><th /></tr>
          </thead>
          <tbody>
            {products?.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-2 font-medium">{p.name}</td>
                <td className="p-2">{p.brand ?? "—"}</td>
                <td className="p-2">{p.category ?? "—"}</td>
                <td className="p-2 text-right">{p.price != null ? `R$ ${Number(p.price).toFixed(2)}` : "—"}</td>
                <td className="p-2 text-right">{p.stock ?? 0}</td>
                <td className="p-2 text-right">
                  <Button size="icon" variant="ghost" onClick={async () => { await supabase.from("products").delete().eq("id", p.id); qc.invalidateQueries({ queryKey: ["products"] }); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {!products?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum produto cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* GALERIA */
function GallerySection({ disabled }: { disabled: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["knowledge_files", "image"],
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_files").select("*").eq("kind", "image").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try { await uploadAndIngest(f, false); }
      catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["knowledge_files"] });
  }
  async function del(id: string, path: string) {
    await supabase.storage.from("knowledge").remove([path]);
    await supabase.from("knowledge_files").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["knowledge_files"] });
  }

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold md:text-lg">Galeria de imagens</h2>
        {!disabled && (
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Enviar imagens
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {data?.map((k: any) => (
          <div key={k.id} className="group relative overflow-hidden rounded-lg border bg-muted/30">
            <img src={publicUrl(k.storage_path)} alt={k.name} className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-xs text-white">
              <span className="truncate">{k.name}</span>
              {!disabled && <button onClick={() => del(k.id, k.storage_path)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        ))}
        {!data?.length && <p className="col-span-full text-sm text-muted-foreground">Nenhuma imagem ainda.</p>}
      </div>
    </section>
  );
}

/* ARQUIVOS */
function FilesSection({ disabled }: { disabled: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["knowledge_files", "doc"],
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_files").select("*").neq("kind", "image").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [importProd, setImportProd] = useState(true);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const res = await uploadAndIngest(f, importProd);
        if (res?.imported_products) toast({ title: "Importado", description: `${res.imported_products} produtos importados de ${f.name}` });
        else toast({ title: "Arquivo enviado", description: f.name });
      } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["knowledge_files"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }
  async function del(id: string, path: string) {
    await supabase.storage.from("knowledge").remove([path]);
    await supabase.from("knowledge_files").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["knowledge_files"] });
  }

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold md:text-lg">Arquivos de conhecimento</h2>
          <p className="text-xs text-muted-foreground">Excel, CSV, TXT ou PDF. Texto extraído alimenta a IA.</p>
        </div>
        {!disabled && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs"><Switch checked={importProd} onCheckedChange={setImportProd} /> Importar como produtos</label>
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Enviar arquivos
            </Button>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf,.ods" multiple className="hidden" onChange={onPick} />
      </div>
      <div className="space-y-2">
        {data?.map((k: any) => (
          <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex min-w-0 items-center gap-3">
              {k.kind === "product_list" ? <Package className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              <div className="min-w-0">
                <div className="truncate font-medium">{k.name}</div>
                <div className="text-xs text-muted-foreground">{k.kind === "product_list" ? "Lista de produtos" : "Documento"} · {(k.size_bytes ?? 0) > 0 ? `${Math.round((k.size_bytes ?? 0) / 1024)} KB` : ""}</div>
              </div>
            </div>
            {!disabled && <Button size="icon" variant="ghost" onClick={() => del(k.id, k.storage_path)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </div>
        ))}
        {!data?.length && <p className="text-sm text-muted-foreground">Nenhum arquivo ainda.</p>}
      </div>
    </section>
  );
}

/* helpers */
function publicUrl(path: string) {
  return supabase.storage.from("knowledge").getPublicUrl(path).data.publicUrl;
}

async function uploadAndIngest(file: File, importProducts: boolean) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? "anon";
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${uid}/${Date.now()}_${safe}`;
  const up = await supabase.storage.from("knowledge").upload(path, file, { upsert: false, contentType: file.type });
  if (up.error) throw up.error;
  const { data, error } = await supabase.functions.invoke("knowledge-ingest", {
    body: { storage_path: path, name: file.name, mime_type: file.type, size_bytes: file.size, import_products: importProducts },
  });
  if (error) throw error;
  return data as any;
}