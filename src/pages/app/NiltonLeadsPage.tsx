import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyProfile } from "@/hooks/useProfile";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Inbox, CheckCircle2, Clock, XCircle, ChevronLeft, ChevronRight } from "lucide-react";

type NiltonLead = {
  id: string;
  sheet_id: string;
  created_time: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  form_name: string | null;
  platform: string | null;
  is_organic: boolean;
  carta_value: string | null;
  nome_completo: string | null;
  telefone: string | null;
  lead_status: string | null;
  status: string;
  notes: string | null;
  imported_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  { value: "em_atendimento", label: "Em atendimento", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  { value: "convertido", label: "Convertido", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  { value: "perdido", label: "Perdido", color: "bg-red-500/15 text-red-700 border-red-500/30" },
];

function statusMeta(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PAGE_SIZE = 20;

export default function NiltonLeadsPage() {
  const navigate = useNavigate();
  const { isSuperadmin, isOwner } = useAuth();
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();

  const isNilton = useMemo(() => {
    const u = (profile?.username ?? "").toLowerCase();
    const n = (profile?.display_name ?? "").toLowerCase();
    const f = (profile?.full_name ?? "").toLowerCase();
    return u === "nilton" || n.startsWith("nilton") || f.startsWith("nilton");
  }, [profile]);

  const canManage = isSuperadmin || isOwner;
  const allowed = canManage || isNilton;

  useEffect(() => {
    if (profile && !allowed) {
      toast.error("Você não tem permissão para acessar esta área.");
      navigate("/crm", { replace: true });
    }
  }, [profile, allowed, navigate]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<NiltonLead | null>(null);
  const [syncing, setSyncing] = useState(false);

  const leadsQuery = useQuery({
    queryKey: ["nilton_leads", search, statusFilter, page],
    queryFn: async () => {
      let q = supabase
        .from("nilton_leads" as any)
        .select("*", { count: "exact" })
        .order("created_time", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) q = q.ilike("nome_completo", `%${search.trim()}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as NiltonLead[], count: count ?? 0 };
    },
    enabled: !!profile && allowed,
  });

  const kpiQuery = useQuery({
    queryKey: ["nilton_leads_kpi"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [tot, hoje, atd, conv] = await Promise.all([
        supabase.from("nilton_leads" as any).select("id", { count: "exact", head: true }),
        supabase.from("nilton_leads" as any).select("id", { count: "exact", head: true }).gte("imported_at", start.toISOString()),
        supabase.from("nilton_leads" as any).select("id", { count: "exact", head: true }).eq("status", "em_atendimento"),
        supabase.from("nilton_leads" as any).select("id", { count: "exact", head: true }).eq("status", "convertido"),
      ]);
      return { total: tot.count ?? 0, hoje: hoje.count ?? 0, em_atendimento: atd.count ?? 0, convertido: conv.count ?? 0 };
    },
    enabled: !!profile && allowed,
  });

  const lastSyncQuery = useQuery({
    queryKey: ["nilton_sync_log_last"],
    queryFn: async () => {
      const { data } = await supabase.from("nilton_sync_log" as any).select("*").order("ran_at", { ascending: false }).limit(10);
      return data ?? [];
    },
    enabled: !!profile && allowed,
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<NiltonLead> }) => {
      const { error } = await supabase.from("nilton_leads" as any).update(vars.patch as any).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nilton_leads"] });
      qc.invalidateQueries({ queryKey: ["nilton_leads_kpi"] });
    },
  });

  async function runSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nilton-leads", { body: {} });
      if (error) throw error;
      const inserted = (data as any)?.rowsInserted ?? 0;
      toast.success(inserted > 0 ? `${inserted} novo(s) lead(s) importado(s)` : "Nenhum lead novo");
      qc.invalidateQueries({ queryKey: ["nilton_leads"] });
      qc.invalidateQueries({ queryKey: ["nilton_leads_kpi"] });
      qc.invalidateQueries({ queryKey: ["nilton_sync_log_last"] });
    } catch (e) {
      toast.error("Falha na sincronização", { description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  if (!profile || !allowed) {
    return <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Carregando…</div>;
  }

  const lastSync = lastSyncQuery.data?.[0] as any;
  const totalPages = Math.max(1, Math.ceil((leadsQuery.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Leads Nilton — Rio Grande do Sul"
        subtitle={`Leads exclusivos sincronizados via Google Sheets${lastSync ? ` · Última sincronização: ${fmtDate(lastSync.ran_at)}` : ""}`}
        actions={
          canManage ? (
            <Button onClick={runSync} disabled={syncing} className="gap-2">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar agora
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 px-3 py-4 md:px-8">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard icon={<Inbox className="h-4 w-4" />} label="Total" value={kpiQuery.data?.total ?? 0} />
          <KpiCard icon={<Clock className="h-4 w-4" />} label="Novos hoje" value={kpiQuery.data?.hoje ?? 0} />
          <KpiCard icon={<RefreshCw className="h-4 w-4" />} label="Em atendimento" value={kpiQuery.data?.em_atendimento ?? 0} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Convertidos" value={kpiQuery.data?.convertido ?? 0} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setPage(0); setStatusFilter(v); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">Carta (valor)</th>
                    <th className="px-4 py-3">Campanha</th>
                    <th className="px-4 py-3">Formulário</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Recebido em</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsQuery.isLoading && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                  )}
                  {!leadsQuery.isLoading && (leadsQuery.data?.rows?.length ?? 0) === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum lead encontrado.</td></tr>
                  )}
                  {leadsQuery.data?.rows?.map((lead) => {
                    const meta = statusMeta(lead.status);
                    return (
                      <tr key={lead.id} onClick={() => setSelected(lead)} className="cursor-pointer border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{lead.nome_completo ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lead.telefone ?? "—"}</td>
                        <td className="px-4 py-3">{lead.carta_value ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lead.campaign_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lead.form_name ?? "—"}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className={meta.color}>{meta.label}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(lead.created_time ?? lead.imported_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>{(leadsQuery.data?.count ?? 0)} lead(s) · página {page + 1} de {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync log (admin only) */}
        {canManage && (
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Histórico de sincronizações (últimas 10)</summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Data/hora</th>
                    <th className="px-4 py-2">Buscadas</th>
                    <th className="px-4 py-2">Inseridas</th>
                    <th className="px-4 py-2">Ignoradas</th>
                    <th className="px-4 py-2">Duração</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(lastSyncQuery.data ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">{fmtDate(r.ran_at)}</td>
                      <td className="px-4 py-2">{r.rows_fetched}</td>
                      <td className="px-4 py-2">{r.rows_inserted}</td>
                      <td className="px-4 py-2">{r.rows_skipped}</td>
                      <td className="px-4 py-2">{r.duration_ms} ms</td>
                      <td className="px-4 py-2">
                        {r.error_message
                          ? <span className="text-red-600">Erro</span>
                          : <span className="text-emerald-600">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.nome_completo ?? "Lead"}</SheetTitle>
                <SheetDescription>Detalhes do lead Rio Grande do Sul</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <Field label="Valor da carta" value={selected.carta_value} />
                <Field label="Campanha" value={selected.campaign_name} />
                <Field label="Conjunto" value={selected.adset_name} />
                <Field label="Anúncio" value={selected.ad_name} />
                <Field label="Formulário" value={selected.form_name} />
                <Field label="Plataforma" value={selected.platform} />
                <Field label="Orgânico" value={selected.is_organic ? "Sim" : "Não"} />
                <Field label="Recebido em" value={fmtDate(selected.created_time)} />
                <Field label="Importado em" value={fmtDate(selected.imported_at)} />
                <Field label="Lead status (origem)" value={selected.lead_status} />

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status interno</label>
                  <Select
                    value={selected.status}
                    onValueChange={async (v) => {
                      setSelected({ ...selected, status: v });
                      await updateMut.mutateAsync({ id: selected.id, patch: { status: v } });
                      toast.success("Status atualizado");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observações</label>
                  <Textarea
                    defaultValue={selected.notes ?? ""}
                    rows={5}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      if (v === (selected.notes ?? "")) return;
                      await updateMut.mutateAsync({ id: selected.id, patch: { notes: v } });
                      setSelected({ ...selected, notes: v });
                      toast.success("Observações salvas");
                    }}
                    placeholder="Anotações sobre o atendimento…"
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value ?? "—"}</span>
    </div>
  );
}
