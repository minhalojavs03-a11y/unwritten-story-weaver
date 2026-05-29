import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, FileSpreadsheet, CheckCircle2, XCircle, Plus, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

type Config = {
  id: string;
  tenant_id: string;
  sheet_url: string;
  sheet_id: string;
  tab_name: string;
  header_row: number;
  last_row_synced: number;
  column_mapping: { nome?: string; telefone?: string; email?: string; interesse?: string };
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

type Log = {
  id: string;
  status: string;
  summary: string | null;
  error_message: string | null;
  new_leads_count: number;
  created_at: string;
};

function extractSheetId(url: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] || "";
}

export default function AdminIntegracoes() {
  const isMobile = useIsMobile();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const FORM_STORAGE_KEY = "admin_integracoes_sheet_form";
  const defaultForm = {
    sheet_url: "",
    tab_name: "Sheet1",
    header_row: 1,
    nome: "A",
    telefone: "B",
    email: "",
    interesse: "",
  };
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(FORM_STORAGE_KEY);
      if (saved) return { ...defaultForm, ...JSON.parse(saved) };
    } catch {}
    return defaultForm;
  });

  useEffect(() => {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);

  async function createConfig() {
    const sheet_id = extractSheetId(form.sheet_url);
    if (!sheet_id) return toast.error("URL inválida do Google Sheets");
    setCreating(true);
    const { data: ctx } = await supabase.rpc("get_my_auth_context");
    let tenant_id = (ctx as any)?.[0]?.tenant_id as string | null;
    if (!tenant_id) {
      const { data: t } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
      tenant_id = (t as any)?.id ?? null;
    }
    if (!tenant_id) {
      setCreating(false);
      return toast.error("Nenhum tenant encontrado");
    }
    const mapping: Record<string, string> = { nome: form.nome.toUpperCase(), telefone: form.telefone.toUpperCase() };
    if (form.email) mapping.email = form.email.toUpperCase();
    if (form.interesse) mapping.interesse = form.interesse.toUpperCase();
    const { error } = await supabase.from("sheet_sync_config").insert({
      tenant_id,
      sheet_url: form.sheet_url,
      sheet_id,
      tab_name: form.tab_name || "Sheet1",
      header_row: form.header_row || 1,
      column_mapping: mapping,
      is_active: true,
    });
    setCreating(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Planilha adicionada");
    setCreateOpen(false);
    setForm({ sheet_url: "", tab_name: "Sheet1", header_row: 1, nome: "A", telefone: "B", email: "", interesse: "" });
    load();
  }

  async function removeConfig(id: string) {
    if (!confirm("Remover esta planilha da sincronização?")) return;
    const { error } = await supabase.from("sheet_sync_config").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Removida");
    load();
  }

  async function load() {
    setLoading(true);
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) {
      setLoading(false);
      return;
    }
    const { data: cfgs } = await supabase.from("sheet_sync_config").select("*").order("created_at");
    const { data: lg } = await supabase
      .from("sheet_sync_logs")
      .select("id,status,summary,error_message,new_leads_count,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setConfigs((cfgs as unknown as Config[]) || []);
    setLogs((lg as unknown as Log[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveConfig(cfg: Config) {
    setSavingId(cfg.id);
    const sheet_id = extractSheetId(cfg.sheet_url) || cfg.sheet_id;
    const { error } = await supabase
      .from("sheet_sync_config")
      .update({
        sheet_url: cfg.sheet_url,
        sheet_id,
        tab_name: cfg.tab_name,
        header_row: cfg.header_row,
        column_mapping: cfg.column_mapping,
        is_active: cfg.is_active,
      })
      .eq("id", cfg.id);
    setSavingId(null);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success("Configuração salva");
    load();
  }

  async function syncNow(cfg: Config) {
    setSyncingId(cfg.id);
    const { data, error } = await supabase.functions.invoke("sheets-sync", {
      body: { config_id: cfg.id },
    });
    setSyncingId(null);
    if (error) return toast.error("Falha: " + error.message);
    const result = (data as any)?.results?.[0];
    if (result?.error) toast.error("Erro: " + result.error);
    else toast.success(`Sincronizado: ${result?.new_leads || 0} novo(s) lead(s)`);
    load();
  }

  function updateLocal(id: string, patch: Partial<Config>) {
    setConfigs((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateMapping(id: string, key: string, value: string) {
    setConfigs((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, column_mapping: { ...c.column_mapping, [key]: value.toUpperCase() } } : c,
      ),
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-32 md:p-6 md:pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Integrações</h1>
          <p className="text-sm text-white/60">Sincronização de leads do Google Sheets (Meta Ads)</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar planilha
        </Button>
      </div>

      {configs.length === 0 && (
        <Card className="bg-white/5 p-6 text-white/70">
          Nenhuma planilha configurada. Clique em <strong>Adicionar planilha</strong> para conectar uma planilha do Google Sheets que recebe os leads do Meta Ads.
        </Card>
      )}

      {configs.map((cfg) => (
        <Card key={cfg.id} className="space-y-4 border-white/10 bg-white/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-white">Planilha {cfg.sheet_id.slice(0, 8)}…</div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  {cfg.last_sync_status === "success" && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  )}
                  {cfg.last_sync_status === "error" && <XCircle className="h-3 w-3 text-red-400" />}
                  {cfg.last_sync_at
                    ? `Última: ${new Date(cfg.last_sync_at).toLocaleString("pt-BR")}`
                    : "Nunca sincronizado"}
                  {" · "}linha {cfg.last_row_synced}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isMobile && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncNow(cfg)}
                  disabled={syncingId === cfg.id}
                >
                  {syncingId === cfg.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sincronizar agora
                </Button>
              )}
              <Switch
                checked={cfg.is_active}
                onCheckedChange={(v) => updateLocal(cfg.id, { is_active: v })}
              />
            </div>
          </div>

          {cfg.last_sync_error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {cfg.last_sync_error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <Label>URL da Planilha</Label>
              <Input
                className="w-full"
                value={cfg.sheet_url}
                onChange={(e) => updateLocal(cfg.id, { sheet_url: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label>Nome da Aba</Label>
              <Input
                className="w-full"
                value={cfg.tab_name}
                onChange={(e) => updateLocal(cfg.id, { tab_name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Mapeamento de colunas (use letras: A, B, C…)</Label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["nome", "telefone", "email", "interesse"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs capitalize text-white/60">{k}</Label>
                  <Input
                    value={cfg.column_mapping?.[k] || ""}
                    placeholder="A"
                    onChange={(e) => updateMapping(cfg.id, k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => removeConfig(cfg.id)} className="text-red-300 hover:bg-red-500/10 hover:text-red-200">
              <Trash2 className="mr-2 h-4 w-4" /> Remover
            </Button>
            <Button onClick={() => saveConfig(cfg)} disabled={savingId === cfg.id}>
              {savingId === cfg.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>

        </Card>
      ))}

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-white">Histórico de execuções</h2>
        <Card className="border-white/10 bg-white/5">
          {logs.length === 0 ? (
            <div className="p-6 text-sm text-white/50">Nenhuma execução ainda.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                  <div className="flex items-center gap-3">
                    {l.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <div>
                      <div className="text-white">{l.summary || l.error_message || "—"}</div>
                      <div className="text-xs text-white/40">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-emerald-300">
                    {l.new_leads_count > 0 ? `+${l.new_leads_count}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {isMobile && configs.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 bg-[#0b0b14]/95 p-3 backdrop-blur md:hidden">
          <Button
            className="w-full"
            onClick={() => syncNow(configs[0])}
            disabled={syncingId === configs[0].id}
          >
            {syncingId === configs[0].id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar planilha do Google Sheets</DialogTitle>
            <DialogDescription>
              Cole o link da planilha onde o Meta Ads grava os leads. A planilha precisa estar compartilhada como "Qualquer pessoa com o link pode ver".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>URL da planilha</Label>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={form.sheet_url}
                onChange={(e) => setForm({ ...form, sheet_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome da aba</Label>
                <Input value={form.tab_name} onChange={(e) => setForm({ ...form, tab_name: e.target.value })} />
              </div>
              <div>
                <Label>Linha do cabeçalho</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.header_row}
                  onChange={(e) => setForm({ ...form, header_row: Number(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Colunas (letras: A, B, C…)</Label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(["nome", "telefone", "email", "interesse"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs capitalize text-white/60">{k}</Label>
                    <Input
                      placeholder={k === "nome" ? "A" : k === "telefone" ? "B" : ""}
                      value={(form as any)[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-white/40">Nome e telefone são obrigatórios. Email e interesse são opcionais.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createConfig} disabled={creating || !form.sheet_url}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
