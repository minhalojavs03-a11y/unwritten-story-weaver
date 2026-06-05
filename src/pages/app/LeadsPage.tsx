import React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "./PageHeader";
import { TempBadge } from "@/components/oticaflow/TempBadge";
import { LeadProgressBar } from "@/components/oticaflow/LeadProgressBar";
import { StageBadge } from "@/components/oticaflow/StageBadge";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { timeAgo } from "@/lib/format";
import { useLeads, useCreateLead, useUpdateLead, useTenantMembers } from "@/hooks/useData";
import { useRef, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, StickyNote, MessageCircle, Phone, Trophy, XCircle, Clock, Sparkles, Pencil, ListChecks, Target, ChevronDown, Calendar as CalendarIcon, User as UserIcon, Mail, Hash, Flame, FileText, Tag, Search, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useActiveMemberLimit } from "@/hooks/useActiveMemberLimit";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const QUALIFICATION_OPTIONS = [
  { value: "em_qualificacao", label: "Em qualificação" },
  { value: "qualificado", label: "Qualificado" },
  { value: "desqualificado", label: "Desqualificado" },
  { value: "oportunidade_futura", label: "Oportunidade futura" },
] as const;

const PHASE_OPTIONS = [
  { value: "prospeccao", label: "Prospecção" },
  { value: "primeiro_contato", label: "Primeiro contato" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "simulacao", label: "Simulação enviada" },
  { value: "negociacao", label: "Negociação" },
  { value: "fechamento", label: "Fechamento" },
  { value: "pos_venda", label: "Pós-venda" },
] as const;

const OPPORTUNITY_OPTIONS = [
  { value: "imediata", label: "Imediata (0-30 dias)" },
  { value: "curto_prazo", label: "Curto prazo (1-3 meses)" },
  { value: "medio_prazo", label: "Médio prazo (3-6 meses)" },
  { value: "longo_prazo", label: "Longo prazo (6+ meses)" },
  { value: "sem_interesse", label: "Sem interesse" },
] as const;

const DISQUALIFY_REASONS = [
  { value: "sem_renda", label: "Sem renda compatível" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "ja_tem_consorcio", label: "Já tem consórcio" },
  { value: "prefere_financiamento", label: "Prefere financiamento" },
  { value: "ja_comprou", label: "Já comprou em outro lugar" },
  { value: "numero_errado", label: "Número errado / não é o cliente" },
  { value: "nao_responde", label: "Não responde após várias tentativas" },
  { value: "outro", label: "Outro motivo" },
] as const;

const ASSET_OPTIONS = [
  { value: "imovel", label: "Imóvel" },
  { value: "automovel", label: "Automóvel" },
  { value: "moto", label: "Moto" },
  { value: "caminhao", label: "Caminhão / Pesados" },
  { value: "servicos", label: "Serviços" },
  { value: "outro", label: "Outro" },
] as const;

// Move o lead no pipeline automaticamente conforme qualificação + fase.
function computeStageFromDetails(qualification: string | null, phase: string | null): string | null {
  if (qualification === "desqualificado") return "perdido";
  if (phase === "pos_venda") return "comprou";
  if (phase === "fechamento" || phase === "negociacao") return "compareceu";
  if (phase === "simulacao" || phase === "apresentacao") return "agendado";
  if (qualification === "qualificado" || qualification === "oportunidade_futura") return "qualificado";
  if (qualification === "em_qualificacao" || phase === "primeiro_contato") return "qualificado";
  if (phase === "prospeccao") return "novo";
  return null;
}

function labelFor(opts: readonly { value: string; label: string }[], v: string | null | undefined) {
  if (!v) return null;
  return opts.find((o) => o.value === v)?.label ?? v;
}
import * as XLSX from "xlsx";

type Lead = Tables<"leads">;

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="break-words text-foreground/90">{value}</div>
      </div>
    </div>
  );
}


function outcomeMeta(l: Lead) {
  if (l.status === "won" || l.stage === "comprou") {
    return { label: "Fechou negócio", className: "border-success/30 bg-success/10 text-success", Icon: Trophy };
  }
  if (l.status === "lost" || l.stage === "perdido") {
    return { label: "Não fechou", className: "border-destructive/30 bg-destructive/10 text-destructive", Icon: XCircle };
  }
  if (l.stage === "atendimento" || l.assigned_to) {
    return { label: "Em atendimento", className: "border-info/30 bg-info/10 text-info", Icon: Clock };
  }
  return { label: "Novo", className: "border-border bg-muted text-muted-foreground", Icon: Sparkles };
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().trim();
    if (keys.includes(norm)) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default function LeadsPage() {
  const { can } = usePermissions();
  const canViewAll = can("view_all_leads");
  const { data: allLeads = [], isLoading } = useLeads(canViewAll ? { kind: "all" } : undefined);
  const { member } = useActiveMember();
  const { user } = useAuth();
  const memberId = member?.id ?? null;
  // Filtro estrito por atribuição:
  // - Se há um membro interno ativo (Lucas, etc.), SEMPRE mostra apenas os
  //   leads atribuídos a ele, mesmo que o usuário Supabase seja owner.
  // - Sem membro ativo, só owner/supervisor/superadmin vê tudo.
  const { maxCreditValue } = useActiveMemberLimit();
  void maxCreditValue;
  const leads = (() => {
    // Considera apenas registros que SÃO leads (descarta kind="outros" —
    // contatos do WhatsApp sem intenção comercial). Mantém quando kind é
    // nulo, "lead" ou outros valores explicitamente comerciais.
    const isRealLead = (l: any) => {
      const k = (l?.kind ?? "").toString().toLowerCase();
      return k !== "outros" && k !== "outro" && k !== "contato";
    };
    // Owners/supervisores/superadmins veem todos os leads atribuídos
    // (descarta não-atribuídos para focar na operação real).
    if (canViewAll) {
      return allLeads.filter((l) => {
        const a = (l as any).assigned_to;
        const m = (l as any).assigned_member_id;
        return (!!a || !!m) && isRealLead(l);
      });
    }
    if (memberId) {
      return allLeads.filter((l) => (l as any).assigned_member_id === memberId && isRealLead(l));
    }
    return allLeads.filter((l) => {
      const assignedUser = (l as any).assigned_to as string | null | undefined;
      return !!(user?.id && assignedUser === user.id) && isRealLead(l);
    });
  })();

  const create = useCreateLead();
  const update = useUpdateLead();
  const { data: tenantMembers = [] } = useTenantMembers();
  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; role: string | null }>();
    for (const tm of tenantMembers as any[]) {
      m.set(tm.id, { name: tm.display_name || tm.username || "—", role: tm.role_label ?? null });
    }
    return m;
  }, [tenantMembers]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [importing, setImporting] = useState(false);
  const [noteFor, setNoteFor] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [detailFor, setDetailFor] = useState<Lead | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  type Period = "today" | "7d" | "30d" | "all" | "custom";
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  type SourceFilter = "all" | "ads" | "import" | "other";
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const canManage = canViewAll;

  const classifySource = (lead: { source?: string | null; imported_from_sheet?: boolean | null }): "ads" | "import" | "other" => {
    const s = (lead.source ?? "").toLowerCase();
    // Qualquer lead com a flag de planilha/anúncio cai em "Anúncio / Sheets"
    if (lead.imported_from_sheet) return "ads";
    if (s.includes("meta") || s.includes("ads") || s.includes("anuncio") || s.includes("anúncio") || s.includes("sheets") || s.includes("facebook") || s.includes("instagram") || s.includes("google") || s.includes("tiktok") || s.includes("linkedin")) return "ads";
    if (s.includes("importacao") || s.includes("importação") || s.includes("planilha") || s.includes("excel") || s.includes("csv") || s.includes("manual")) return "import";
    return "other";
  };

  const sourceCounts = useMemo(() => {
    const counts = { all: leads.length, ads: 0, import: 0, other: 0 };
    for (const l of leads) counts[classifySource(l as any)]++;
    return counts;
  }, [leads]);

  // Aplica filtros (período + origem + busca) sobre os leads visíveis.
  const filteredLeads = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (period === "today") {
      from = new Date(now); from.setHours(0, 0, 0, 0);
    } else if (period === "7d") {
      from = new Date(now); from.setDate(from.getDate() - 7);
    } else if (period === "30d") {
      from = new Date(now); from.setDate(from.getDate() - 30);
    } else if (period === "custom") {
      if (customFrom) { from = new Date(customFrom); from.setHours(0, 0, 0, 0); }
      if (customTo) { to = new Date(customTo); to.setHours(23, 59, 59, 999); }
    }
    const q = search.trim().toLowerCase();
    const digitsQ = q.replace(/\D/g, "");
    return leads.filter((l) => {
      if (sourceFilter !== "all" && classifySource(l.source) !== sourceFilter) return false;
      if (period !== "all") {
        const t = new Date(l.created_at as string).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
      }
      if (q) {
        const name = (l.name || "").toLowerCase();
        const email = (l.email || "").toLowerCase();
        const phoneDigits = (l.phone || "").replace(/\D/g, "");
        if (!name.includes(q) && !email.includes(q) && !(digitsQ && phoneDigits.includes(digitsQ))) return false;
      }
      return true;
    });
  }, [leads, period, customFrom, customTo, sourceFilter, search]);

  const [detail, setDetail] = useState<{
    contact_attempts: number;
    qualification_status: string;
    lead_phase: string;
    opportunity_type: string;
    disqualification_reason: string;
    asset_type: string;
    credit_value: string;
    next_followup_at: string;
  }>({
    contact_attempts: 0,
    qualification_status: "",
    lead_phase: "",
    opportunity_type: "",
    disqualification_reason: "",
    asset_type: "",
    credit_value: "",
    next_followup_at: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (noteFor) setNoteText(noteFor.notes ?? "");
  }, [noteFor]);

  useEffect(() => {
    if (detailFor) {
      const l = detailFor as any;
      setDetail({
        contact_attempts: l.contact_attempts ?? 0,
        qualification_status: l.qualification_status ?? "",
        lead_phase: l.lead_phase ?? "",
        opportunity_type: l.opportunity_type ?? "",
        disqualification_reason: l.disqualification_reason ?? "",
        asset_type: l.asset_type ?? "",
        credit_value: l.credit_value != null ? String(l.credit_value) : "",
        next_followup_at: l.next_followup_at ? new Date(l.next_followup_at).toISOString().slice(0, 16) : "",
      });
    }
  }, [detailFor]);

  async function saveDetail() {
    if (!detailFor) return;
    try {
      const patch: any = {
        contact_attempts: Math.max(0, Math.min(7, Number(detail.contact_attempts) || 0)),
        qualification_status: detail.qualification_status || null,
        lead_phase: detail.lead_phase || null,
        opportunity_type: detail.opportunity_type || null,
        disqualification_reason: detail.qualification_status === "desqualificado" ? (detail.disqualification_reason || null) : null,
        asset_type: detail.asset_type || null,
        credit_value: detail.credit_value ? Number(detail.credit_value.replace(",", ".")) : null,
        next_followup_at: detail.next_followup_at ? new Date(detail.next_followup_at).toISOString() : null,
        last_interaction_at: new Date().toISOString(),
      };
      const autoStage = computeStageFromDetails(patch.qualification_status, patch.lead_phase);
      if (autoStage) {
        patch.stage = autoStage;
        if (autoStage === "comprou") patch.status = "won";
        else if (autoStage === "perdido") patch.status = "lost";
      }
      await update.mutateAsync({ id: detailFor.id, patch });
      toast({
        title: "Detalhes salvos",
        description: patch.stage ? `Lead movido para "${patch.stage}" no pipeline.` : undefined,
      });
      setDetailFor(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function saveNote() {
    if (!noteFor) return;
    try {
      await update.mutateAsync({
        id: noteFor.id,
        patch: { notes: noteText.trim() || null, last_interaction_at: new Date().toISOString() },
      });
      try {
        const { error: notifyErr } = await supabase.functions.invoke("notify-supervisors", {
          body: { lead_id: noteFor.id, note: noteText.trim() },
        });
        if (notifyErr) console.warn("notify-supervisors", notifyErr);
        else toast({ title: "Anotação salva", description: "Encaminhada para Ediane e Antonio" });
      } catch (err) {
        console.warn("notify-supervisors failed", err);
        toast({ title: "Anotação salva", description: "Não foi possível notificar os supervisores" });
      }
      setNoteFor(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function submit() {
    try {
      await create.mutateAsync({ name: name || null, phone, email: email || null });
      toast({ title: "Lead criado" });
      setOpen(false); setName(""); setPhone(""); setEmail("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!rows.length) { toast({ title: "Planilha vazia" }); return; }

      const existing = new Set(leads.map((l) => normalizePhone(l.phone ?? "")));
      let ok = 0, dup = 0, fail = 0;
      for (const row of rows) {
        const phoneRaw = pick(row, ["phone", "telefone", "celular", "whatsapp", "fone", "telephone"]);
        const phone = normalizePhone(phoneRaw);
        if (!phone) { fail++; continue; }
        if (existing.has(phone)) { dup++; continue; }
        const name = pick(row, ["name", "nome", "cliente", "contato"]) || null;
        const email = pick(row, ["email", "e-mail", "mail"]) || null;
        try {
          await create.mutateAsync({ name, phone, email });
          existing.add(phone);
          ok++;
        } catch { fail++; }
      }
      toast({
        title: `Importação concluída`,
        description: `${ok} criados · ${dup} duplicados · ${fail} ignorados`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao ler planilha", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader title="Lista de Leads" subtitle="Todos os contatos" actions={
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importing ? "Importando…" : "Importar Excel"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>+ Novo lead</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Telefone (com DDD)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999999999" /></div>
                <div className="space-y-1.5"><Label>E-mail (opcional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <Button onClick={submit} disabled={!phone || create.isPending} className="w-full">{create.isPending ? "Salvando…" : "Criar"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      } />
      <div className="p-3 md:p-8 space-y-3">
        {/* Buscador */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, email…"
            className="h-11 rounded-full border-border/60 bg-card pl-9 pr-9 text-sm shadow-sm focus-visible:ring-primary/40"
            inputMode="search"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {search && (
            <div className="mt-2 px-1 text-[11px] text-muted-foreground">
              {filteredLeads.length} de {leads.length} {leads.length === 1 ? "lead" : "leads"}
            </div>
          )}
        </div>

        {/* Filtro por período */}
        {leads.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
            <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Período</span>
            {([
              { v: "all", label: "Tudo" },
              { v: "today", label: "Hoje" },
              { v: "7d", label: "7 dias" },
              { v: "30d", label: "30 dias" },
              { v: "custom", label: "Personalizado" },
            ] as { v: Period; label: string }[]).map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={period === opt.v ? "default" : "outline"}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setPeriod(opt.v)}
              >
                {opt.label}
              </Button>
            ))}
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[150px] text-xs" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[150px] text-xs" />
              </div>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"}
            </span>
          </div>
        )}
        {/* Filtro por origem */}
        {leads.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              { v: "all", label: "Todos", count: sourceCounts.all, cls: "border-border bg-card text-foreground", active: "border-primary bg-primary text-primary-foreground" },
              { v: "ads", label: "Anúncio / Sheets", count: sourceCounts.ads, cls: "border-info/30 bg-info/5 text-info", active: "border-info bg-info text-white" },
              { v: "import", label: "Importação manual", count: sourceCounts.import, cls: "border-success/30 bg-success/5 text-foreground", active: "border-success bg-success text-white" },
              { v: "other", label: "Outros", count: sourceCounts.other, cls: "border-border bg-muted/30 text-foreground", active: "border-foreground bg-foreground text-background" },
            ] as { v: SourceFilter; label: string; count: number; cls: string; active: string }[]).map((opt) => {
              const isActive = sourceFilter === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setSourceFilter(opt.v)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                    isActive ? opt.active : opt.cls,
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide">{opt.label}</span>
                  <span className={cn("text-sm font-bold tabular-nums", isActive ? "" : "text-muted-foreground")}>{opt.count}</span>
                </button>
              );
            })}
          </div>
        )}
        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && leads.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum lead ativo. Eles aparecem aqui assim que escreverem no WhatsApp.</p>
          </div>
        )}
        {!isLoading && leads.length > 0 && filteredLeads.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center flex flex-col items-center gap-3">
            <Search className="h-8 w-8 opacity-50 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado{search ? " para a busca" : " para o período selecionado"}.</p>
            {search && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSearch("")}>Limpar busca</Button>
            )}
          </div>
        )}
        {filteredLeads.length > 0 && (
          <>
            {/* Mobile */}
            <ul className="space-y-2 md:hidden">
              {filteredLeads.map((l) => {
                const o = outcomeMeta(l);
                const la = l as any;
                const expanded = expandedId === l.id;
                const qLbl = labelFor(QUALIFICATION_OPTIONS, la.qualification_status);
                const assignedMember = la.assigned_member_id ? memberMap.get(la.assigned_member_id) : null;
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "rounded-xl border bg-card p-3 transition-colors",
                      expanded && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : l.id)}
                      aria-expanded={expanded}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <InitialsAvatar name={l.name ?? "?"} className="h-10 w-10 shrink-0 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{l.name ?? "Sem nome"}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <TempBadge temperature={l.temperature} />
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180 text-primary")} />
                          </div>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.phone}</div>
                        <div className="mt-1.5">
                          <LeadProgressBar temperature={l.temperature} stage={l.stage} showPercent />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${o.className}`}>
                            <o.Icon className="h-3 w-3" />
                            {o.label}
                          </span>
                          <StageBadge stage={l.stage} />
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{l.last_message_at ? timeAgo(l.last_message_at) : "—"}</span>
                        </div>
                        {(() => {
                          const chips: { label: string; cls: string }[] = [];
                          if (qLbl) chips.push({
                            label: qLbl,
                            cls: la.qualification_status === "qualificado" ? "bg-success/10 text-success border-success/20"
                              : la.qualification_status === "desqualificado" ? "bg-destructive/10 text-destructive border-destructive/20"
                              : la.qualification_status === "oportunidade_futura" ? "bg-info/10 text-info border-info/20"
                              : "bg-muted text-muted-foreground border-border"
                          });
                          const pLbl = labelFor(PHASE_OPTIONS, la.lead_phase);
                          if (pLbl) chips.push({ label: pLbl, cls: "bg-primary/10 text-primary border-primary/20" });
                          if ((la.contact_attempts ?? 0) > 0) chips.push({ label: `${la.contact_attempts}/7 tentativas`, cls: "bg-muted text-muted-foreground border-border" });
                          if (!chips.length) return null;
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {chips.map((c, i) => (
                                <span key={i} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>{c.label}</span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </button>

                    {expanded && (
                      <div className="mt-3 space-y-2.5 border-t pt-3">
                        <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identificação</div>
                          <DetailRow icon={UserIcon} label="Nome" value={l.name || "—"} />
                          <DetailRow icon={Phone} label="Telefone" value={l.phone || "—"} />
                          <DetailRow icon={Mail} label="E-mail" value={l.email || "—"} />
                          <DetailRow icon={Tag} label="Origem" value={l.source || "—"} />
                        </div>
                        <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Situação comercial</div>
                          <DetailRow icon={Target} label="Qualificação" value={qLbl || "—"} />
                          <DetailRow icon={ListChecks} label="Fase" value={labelFor(PHASE_OPTIONS, la.lead_phase) || l.stage || "—"} />
                          <DetailRow icon={Sparkles} label="Oportunidade" value={labelFor(OPPORTUNITY_OPTIONS, la.opportunity_type) || "—"} />
                          <DetailRow icon={Hash} label="Tentativas" value={`${la.contact_attempts ?? 0}/7`} />
                          <DetailRow icon={Flame} label="Temperatura" value={l.temperature ?? "—"} />
                          {la.credit_value && (
                            <DetailRow icon={Trophy} label="Valor crédito" value={`R$ ${Number(la.credit_value).toLocaleString("pt-BR")}`} />
                          )}
                          {la.asset_type && (
                            <DetailRow icon={Tag} label="Bem" value={labelFor(ASSET_OPTIONS, la.asset_type) || la.asset_type} />
                          )}
                        </div>
                        <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atribuição & datas</div>
                          <DetailRow icon={UserIcon} label="Consultor" value={assignedMember ? `${assignedMember.name}${assignedMember.role ? ` · ${assignedMember.role}` : ""}` : "Não atribuído"} />
                          <DetailRow icon={CalendarIcon} label="Criado" value={l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "—"} />
                          <DetailRow icon={MessageCircle} label="Última mensagem" value={l.last_message_at ? `${new Date(l.last_message_at).toLocaleString("pt-BR")} (${timeAgo(l.last_message_at)})` : "—"} />
                          <DetailRow icon={Clock} label="Próx. follow-up" value={la.next_followup_at ? new Date(la.next_followup_at).toLocaleString("pt-BR") : "—"} />
                        </div>
                        {(l.notes || (l.tags && l.tags.length > 0)) && (
                          <div className="space-y-2 rounded-lg border bg-background/60 p-2.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              <FileText className="h-3 w-3" /> Anotações & tags
                            </div>
                            {l.notes && <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">{l.notes}</p>}
                            {l.tags && l.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {l.tags.map((t, i) => (
                                  <span key={i} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <Button asChild size="sm" variant="outline" className="h-8 rounded-full text-xs">
                            <Link to={`/conversas?lead=${l.id}`}><MessageCircle className="mr-1 h-3.5 w-3.5" />Conversa</Link>
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setNoteFor(l)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {l.notes ? "Nota" : "Anotar"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setDetailFor(l)}>
                            <Target className="mr-1 h-3.5 w-3.5" />Detalhes
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Desktop */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[6%]" />
                  <col className="hidden xl:table-column xl:w-[18%]" />
                  <col className="hidden lg:table-column lg:w-[10%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Lead</th>
                    <th className="px-2 py-2.5 font-medium">Atend.</th>
                    <th className="px-2 py-2.5 font-medium">Qualif.</th>
                    <th className="px-2 py-2.5 font-medium">Fase</th>
                    <th className="px-2 py-2.5 font-medium text-center">Tent.</th>
                    <th className="px-2 py-2.5 font-medium hidden xl:table-cell">Anotação</th>
                    <th className="px-2 py-2.5 font-medium hidden lg:table-cell">Últ. msg</th>
                    <th className="px-3 py-2.5 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((l) => {
                    const o = outcomeMeta(l);
                    const la = l as any;
                    const qLbl = labelFor(QUALIFICATION_OPTIONS, la.qualification_status);
                    const qCls = la.qualification_status === "qualificado" ? "bg-success/10 text-success border-success/20"
                      : la.qualification_status === "desqualificado" ? "bg-destructive/10 text-destructive border-destructive/20"
                      : la.qualification_status === "oportunidade_futura" ? "bg-info/10 text-info border-info/20"
                      : "bg-muted text-muted-foreground border-border";
                    const expanded = expandedId === l.id;
                    const assignedMember = la.assigned_member_id ? memberMap.get(la.assigned_member_id) : null;
                    return (
                      <React.Fragment key={l.id}>
                        <tr
                          className={cn(
                            "align-middle cursor-pointer transition-colors",
                            expanded ? "bg-primary/5" : "hover:bg-muted/30",
                          )}
                          onClick={() => setExpandedId(expanded ? null : l.id)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180 text-primary")} />
                              <InitialsAvatar name={l.name ?? "?"} className="h-9 w-9 shrink-0 text-xs" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-[13px]">{l.name ?? "Sem nome"}</div>
                                <div className="truncate text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{l.phone}</div>
                                <div className="mt-1">
                                  <LeadProgressBar temperature={l.temperature} stage={l.stage} showMarker={false} showPercent />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${o.className}`}>
                              <o.Icon className="h-3 w-3" />
                              <span className="truncate">{o.label}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            {qLbl ? (
                              <span className={`inline-flex max-w-full items-center truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${qCls}`}>{qLbl}</span>
                            ) : <span className="text-xs text-muted-foreground/60 italic">—</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            {labelFor(PHASE_OPTIONS, la.lead_phase) ? (
                              <span className="inline-flex max-w-full items-center truncate rounded-full border bg-primary/10 text-primary border-primary/20 px-1.5 py-0.5 text-[10px] font-medium">
                                {labelFor(PHASE_OPTIONS, la.lead_phase)}
                              </span>
                            ) : <StageBadge stage={l.stage} className="text-[10px] px-1.5" />}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${(la.contact_attempts ?? 0) >= 5 ? "border-destructive/30 bg-destructive/10 text-destructive" : (la.contact_attempts ?? 0) >= 3 ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-muted text-muted-foreground"}`}>
                              {la.contact_attempts ?? 0}/7
                            </span>
                          </td>
                          <td className="px-2 py-2.5 hidden xl:table-cell">
                            {l.notes ? (
                              <p className="line-clamp-2 text-[11px] text-muted-foreground whitespace-pre-wrap">{l.notes}</p>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 italic">sem anotações</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-muted-foreground text-[11px] hidden lg:table-cell whitespace-nowrap">{l.last_message_at ? timeAgo(l.last_message_at) : "—"}</td>
                          <td className="px-2 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Detalhes do lead" onClick={() => setDetailFor(l)}>
                                <Target className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Anotar" onClick={() => setNoteFor(l)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir conversa">
                                <Link to={`/conversas?lead=${l.id}`}><MessageCircle className="h-4 w-4" /></Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${l.id}-exp`} className="bg-muted/20">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div className="space-y-2 rounded-lg border bg-card p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identificação</div>
                                  <DetailRow icon={UserIcon} label="Nome" value={l.name || "—"} />
                                  <DetailRow icon={Phone} label="Telefone" value={l.phone || "—"} />
                                  <DetailRow icon={Mail} label="E-mail" value={l.email || "—"} />
                                  <DetailRow icon={Tag} label="Origem" value={l.source || "—"} />
                                </div>
                                <div className="space-y-2 rounded-lg border bg-card p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Situação comercial</div>
                                  <DetailRow icon={Target} label="Qualificação" value={qLbl || "—"} />
                                  <DetailRow icon={ListChecks} label="Fase" value={labelFor(PHASE_OPTIONS, la.lead_phase) || l.stage || "—"} />
                                  <DetailRow icon={Sparkles} label="Oportunidade" value={labelFor(OPPORTUNITY_OPTIONS, la.opportunity_type) || "—"} />
                                  <DetailRow icon={Hash} label="Tentativas" value={`${la.contact_attempts ?? 0}/7`} />
                                  <DetailRow icon={Flame} label="Temperatura" value={l.temperature ?? "—"} />
                                </div>
                                <div className="space-y-2 rounded-lg border bg-card p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atribuição & datas</div>
                                  <DetailRow icon={UserIcon} label="Consultor" value={assignedMember ? `${assignedMember.name}${assignedMember.role ? ` · ${assignedMember.role}` : ""}` : "Não atribuído"} />
                                  <DetailRow icon={CalendarIcon} label="Criado" value={l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "—"} />
                                  <DetailRow icon={MessageCircle} label="Última mensagem" value={l.last_message_at ? `${new Date(l.last_message_at).toLocaleString("pt-BR")} (${timeAgo(l.last_message_at)})` : "—"} />
                                  <DetailRow icon={Clock} label="Próx. follow-up" value={la.next_followup_at ? new Date(la.next_followup_at).toLocaleString("pt-BR") : "—"} />
                                  {la.credit_value && (
                                    <DetailRow icon={Trophy} label="Valor crédito" value={`R$ ${Number(la.credit_value).toLocaleString("pt-BR")}`} />
                                  )}
                                  {la.asset_type && (
                                    <DetailRow icon={Tag} label="Bem" value={labelFor(ASSET_OPTIONS, la.asset_type) || la.asset_type} />
                                  )}
                                </div>
                                {(l.notes || (l.tags && l.tags.length > 0)) && (
                                  <div className="space-y-2 rounded-lg border bg-card p-3 md:col-span-2 xl:col-span-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                      <FileText className="h-3 w-3" /> Anotações & tags
                                    </div>
                                    {l.notes && <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">{l.notes}</p>}
                                    {l.tags && l.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        {l.tags.map((t, i) => (
                                          <span key={i} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-3">
                                  <Button asChild size="sm" variant="default">
                                    <Link to={`/conversas?lead=${l.id}`}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Abrir conversa</Link>
                                  </Button>
                                  {canManage && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => setDetailFor(l)}>
                                        <Target className="mr-1.5 h-3.5 w-3.5" />Editar detalhes
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => setNoteFor(l)}>
                                        <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar anotação
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>

      <Dialog open={!!noteFor} onOpenChange={(o) => { if (!o) setNoteFor(null); }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4 text-primary" />
              Anotações do atendimento
            </DialogTitle>
            <DialogDescription className="text-xs">
              {noteFor?.name || "Lead"} {noteFor?.phone ? `· ${noteFor.phone}` : ""}
            </DialogDescription>
          </DialogHeader>

          {noteFor && (() => {
            const o = outcomeMeta(noteFor);
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${o.className}`}>
                  <o.Icon className="h-3 w-3" />
                  {o.label}
                </span>
                <StageBadge stage={noteFor.stage} />
                {noteFor.last_interaction_at && (
                  <span className="text-[11px] text-muted-foreground">
                    último contato {timeAgo(noteFor.last_interaction_at)}
                  </span>
                )}
              </div>
            );
          })()}

          <Textarea
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={2000}
            placeholder="Escreva como foi o atendimento, próximos passos, objeções do cliente..."
            className="min-h-[160px] text-sm"
          />
          <div className="text-right text-[11px] text-muted-foreground">{noteText.length}/2000</div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setNoteFor(null)}>
              Cancelar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={saveNote} disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar anotação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailFor} onOpenChange={(o) => { if (!o) setDetailFor(null); }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Detalhes do lead
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detailFor?.name || "Lead"} {detailFor?.phone ? `· ${detailFor.phone}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status de qualificação</Label>
              <Select value={detail.qualification_status} onValueChange={(v) => setDetail((d) => ({ ...d, qualification_status: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {QUALIFICATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Fase do lead</Label>
              <Select value={detail.lead_phase} onValueChange={(v) => setDetail((d) => ({ ...d, lead_phase: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {PHASE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de oportunidade</Label>
              <Select value={detail.opportunity_type} onValueChange={(v) => setDetail((d) => ({ ...d, opportunity_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {OPPORTUNITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de bem (consórcio)</Label>
              <Select value={detail.asset_type} onValueChange={(v) => setDetail((d) => ({ ...d, asset_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {ASSET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tentativas de contato (0–7)</Label>
              <Select
                value={String(detail.contact_attempts)}
                onValueChange={(v) => setDetail((d) => ({ ...d, contact_attempts: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 8 }, (_, i) => i).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} {n === 0 ? "(nenhuma)" : n === 1 ? "tentativa" : "tentativas"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Valor de crédito (R$)</Label>
              <Input
                inputMode="decimal"
                value={detail.credit_value}
                onChange={(e) => setDetail((d) => ({ ...d, credit_value: e.target.value }))}
                placeholder="Ex.: 120000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Próximo follow-up</Label>
              <Input
                type="datetime-local"
                value={detail.next_followup_at}
                onChange={(e) => setDetail((d) => ({ ...d, next_followup_at: e.target.value }))}
              />
            </div>

            {detail.qualification_status === "desqualificado" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Motivo da desqualificação</Label>
                <Select value={detail.disqualification_reason} onValueChange={(v) => setDetail((d) => ({ ...d, disqualification_reason: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um motivo…" /></SelectTrigger>
                  <SelectContent>
                    {DISQUALIFY_REASONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setDetailFor(null)}>
              Cancelar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={saveDetail} disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar detalhes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}
