import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "./PageHeader";
import { TempBadge } from "@/components/oticaflow/TempBadge";
import { LeadProgressBar } from "@/components/oticaflow/LeadProgressBar";
import { StageBadge } from "@/components/oticaflow/StageBadge";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { timeAgo } from "@/lib/format";
import { useLeads, useCreateLead, useUpdateLead, useTenantMembers } from "@/hooks/useData";
import { useRef, useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, StickyNote, MessageCircle, Phone, Trophy, XCircle, Clock, Sparkles, Pencil, ListChecks, Target, ChevronDown, Calendar as CalendarIcon, User as UserIcon, Mail, Hash, Flame, FileText, Tag, Search, X, Trash2, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { invalidateLeadMetrics } from "@/lib/leadMetrics";
import { usePermissions } from "@/hooks/usePermissions";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useActiveMemberLimit } from "@/hooks/useActiveMemberLimit";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useLeadSearch } from "@/hooks/useLeadSearch";
import { cn } from "@/lib/utils";
import { useCanViewLeadPhone, displayPhone } from "@/lib/leadPrivacy";
import { CLOSERS } from "@/lib/closers";
import { autoLeadValue } from "@/hooks/useCloserAgenda";

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
  const effective = useEffectiveUser();
  // Em modo suporte (Arley olhando Micaelly), o filtro deve ser feito pelo
  // membro/usuário alvo, não pelo do superadmin logado.
  const memberId = effective.isImpersonating ? effective.memberId : (member?.id ?? null);
  const effectiveUserId = effective.isImpersonating ? effective.id : (user?.id ?? null);
  const qc = useQueryClient();

  function isManualLead(l: { source?: string | null; imported_from_sheet?: boolean | null }) {
    return !l.imported_from_sheet && (l.source ?? "").toLowerCase() === "manual";
  }

  async function deleteManualLead(leadId: string, leadName?: string | null) {
    if (!window.confirm(`Excluir o lead ${leadName ? `"${leadName}"` : "selecionado"}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.rpc("delete_manual_lead", { _lead_id: leadId });
    if (error) {
      const desc = error.message?.includes("only_manual") ? "Só é possível excluir leads criados manualmente." : error.message;
      toast({ title: "Erro ao excluir", description: desc, variant: "destructive" });
      return;
    }
    toast({ title: "Lead excluído" });
    invalidateLeadMetrics(qc);
  }

  const { maxCreditValue } = useActiveMemberLimit();
  const canViewPhoneFn = useCanViewLeadPhone();
  void maxCreditValue;
  const leads = (() => {
    const isRealLead = (l: any) => {
      const k = (l?.kind ?? "").toString().toLowerCase();
      return k !== "outros" && k !== "outro" && k !== "contato";
    };
    if (canViewAll && !effective.isImpersonating) {
      return allLeads.filter((l) => {
        const a = (l as any).assigned_to;
        const m = (l as any).assigned_member_id;
        return (!!a || !!m) && isRealLead(l);
      });
    }
    if (memberId || effectiveUserId) {
      return allLeads.filter((l) => {
        const m = (l as any).assigned_member_id as string | null | undefined;
        const a = (l as any).assigned_to as string | null | undefined;
        const byMember = !!memberId && m === memberId;
        const byUser = !!effectiveUserId && a === effectiveUserId;
        return (byMember || byUser) && isRealLead(l);
      });
    }
    return [];
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const canManage = canViewAll;

  // Busca no banco (server-side) — encontra também clientes antigos que não
  // estão na lista carregada em memória.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data: remoteLeads = [], isFetching: searchingRemote } = useLeadSearch(debouncedSearch, { limit: 50 });

  // Ao chegar pela busca global (?q= / ?lead=), aplica o termo e abre o lead.
  const focusLeadId = searchParams.get("lead");
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    // Durante uma busca, junta os resultados vindos do banco (clientes antigos)
    // com os leads já carregados e ignora o filtro de período.
    let base = leads as any[];
    if (q) {
      const seen = new Set(base.map((l) => l.id));
      base = [...base, ...(remoteLeads as any[]).filter((l) => l?.id && !seen.has(l.id))];
    }
    return base.filter((l) => {
      if (sourceFilter !== "all" && classifySource(l as any) !== sourceFilter) return false;
      if (!q && period !== "all") {
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
    }).sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
  }, [leads, remoteLeads, period, customFrom, customTo, sourceFilter, search]);

  // Paginação de 100 em 100 para não pesar a renderização.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [period, customFrom, customTo, sourceFilter, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pagedLeads = useMemo(
    () => filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredLeads, page],
  );



  // Abre automaticamente o lead vindo da busca global.
  useEffect(() => {
    if (!focusLeadId) return;
    const found = (filteredLeads as any[]).find((l) => l.id === focusLeadId);
    if (found) {
      setDetailFor(found as Lead);
      const next = new URLSearchParams(searchParams);
      next.delete("lead");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLeadId, filteredLeads]);

  // Anotação simplificada — agora com estágios fixos
  const ANNOTATION_OPTIONS = [
    { value: "simulacao", label: "Simulação enviada" },
    { value: "ligacao", label: "Ligação feita" },
    { value: "reuniao", label: "Reunião agendada" },
    { value: "compareceu", label: "Compareceu na reunião" },
    { value: "nao_compareceu", label: "Não compareceu" },
    { value: "fechou", label: "Fechou" },
    { value: "nao_fechou", label: "Não fechou" },
  ] as const;
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [notFechouReason, setNotFechouReason] = useState<string>("");
  const [meetingDate, setMeetingDate] = useState<string>("");
  const [meetingTime, setMeetingTime] = useState<string>("");
  const [meetingCloser, setMeetingCloser] = useState<string>("");
  const [leadValue, setLeadValue] = useState<string>("");
  const [saleValue, setSaleValue] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleAnnotation(value: string) {
    setAnnotations((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  useEffect(() => {
    if (noteFor) setNoteText(noteFor.notes ?? "");
  }, [noteFor]);

  // Carrega as anotações salvas do lead ao abrir o modal, para que o consultor
  // veja exatamente o que já foi marcado e possa complementar sem perder estado.
  function deriveAnnotationsFromLead(l: Lead) {
    const derived: string[] = [];
    const meta = (l.metadata ?? {}) as Record<string, any>;
    const phase = (l as any).lead_phase;
    const stage = l.stage;
    const status = l.status;
    const qStatus = (l as any).qualification_status;

    if (phase === "simulacao") derived.push("simulacao");
    if (phase === "apresentacao" || meta.meeting_scheduled_at) derived.push("reuniao_agendada");
    if (stage === "compareceu" || meta.meeting_attended === true) derived.push("compareceu");
    if (meta.meeting_attended === false || meta.meeting_no_show_reason) derived.push("nao_compareceu");
    if (stage === "comprou" || status === "won") derived.push("fechou");
    if (stage === "perdido" || status === "lost" || qStatus === "desqualificado") derived.push("nao_fechou");

    // Ligação não tem campo próprio; inferimos pelo histórico de notes.
    if ((l.notes ?? "").includes("Ligação feita")) derived.push("ligacao");

    return Array.from(new Set(derived));
  }

  useEffect(() => {
    if (detailFor) {
      const savedAnnotations = deriveAnnotationsFromLead(detailFor);
      const meta = (detailFor.metadata ?? {}) as Record<string, any>;
      setAnnotations(savedAnnotations);
      setNotFechouReason(detailFor.disqualification_reason ?? "");
      if (meta.meeting_scheduled_at) {
        const d = new Date(meta.meeting_scheduled_at);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          setMeetingDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          setMeetingTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      } else {
        setMeetingDate("");
        setMeetingTime("");
      }
      setMeetingCloser(meta.meeting_closer_id ?? "");
      const autoV = autoLeadValue(detailFor as any);
      setLeadValue(meta.lead_value ? String(meta.lead_value) : autoV ? String(autoV) : "");
      setSaleValue(detailFor.credit_value ? String(detailFor.credit_value) : meta.sale_value ? String(meta.sale_value) : "");
      setSaleDate(meta.sale_date ? String(meta.sale_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
    }
  }, [detailFor]);


  async function saveDetail() {
    if (!detailFor) return;
    if (annotations.length === 0) {
      toast({ title: "Selecione ao menos uma opção", variant: "destructive" });
      return;
    }
    if (annotations.includes("nao_fechou") && !notFechouReason.trim()) {
      toast({ title: "Informe o motivo", description: "Explique brevemente por que não fechou.", variant: "destructive" });
      return;
    }
    if (annotations.includes("reuniao") && (!meetingDate || !meetingTime)) {
      toast({ title: "Informe data e horário", description: "Selecione a data e o horário da reunião agendada.", variant: "destructive" });
      return;
    }
    if (annotations.includes("reuniao") && !meetingCloser) {
      toast({ title: "Selecione o closer", description: "Informe quem vai conduzir a reunião.", variant: "destructive" });
      return;
    }
    const saleAmount = Number(saleValue.replace(/\./g, "").replace(",", "."));
    if (annotations.includes("fechou") && (!saleValue.trim() || !Number.isFinite(saleAmount) || saleAmount <= 0 || !saleDate)) {
      toast({ title: "Informe valor e data da venda", description: "Preencha o valor e a data para registrar o fechamento.", variant: "destructive" });
      return;
    }

    try {
      const patch: any = {
        last_interaction_at: new Date().toISOString(),
      };
      const nowStamp = new Date().toLocaleString("pt-BR");
      const prevNotes = detailFor.notes ? `${detailFor.notes}\n` : "";
      const lines: string[] = [];
      // Ordem de progressão — o estágio final é o mais avançado marcado.
      const has = (v: string) => annotations.includes(v);

      // Valor do lead (anotado pelo consultor ou reconhecido automaticamente).
      const leadAmount = Number(String(leadValue).replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(leadAmount) && leadAmount > 0) {
        patch.metadata = { ...(patch.metadata ?? (detailFor.metadata as any) ?? {}), lead_value: leadAmount };
        if (!detailFor.credit_value) patch.credit_value = leadAmount;
      }


      if (has("simulacao")) {
        patch.stage = "agendado";
        patch.lead_phase = "simulacao";
        lines.push(`[${nowStamp}] Simulação enviada`);
        
        // Update total simulation count
        const currentCount = (detailFor as any).simulation_count || 0;
        patch.simulation_count = currentCount + 1;
      }

      if (has("reuniao")) {
        patch.stage = "agendado";
        patch.lead_phase = "apresentacao";
        const meetingAt = new Date(`${meetingDate}T${meetingTime}:00`);
        const closer = CLOSERS.find((c) => c.id === meetingCloser) ?? null;
        patch.metadata = {
          ...(patch.metadata ?? (detailFor.metadata as any) ?? {}),
          meeting_scheduled_at: meetingAt.toISOString(),
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          meeting_attended: null,
          meeting_closer_id: closer?.id ?? null,
          meeting_closer_name: closer?.name ?? null,
        };
        lines.push(
          `[${nowStamp}] Reunião agendada para ${meetingAt.toLocaleDateString("pt-BR")} às ${meetingTime}${closer ? ` · Closer: ${closer.name}` : ""}`,
        );
      }
      if (has("fechou")) {
        patch.stage = "comprou";
        patch.status = "won";
        patch.lead_phase = "pos_venda";
        patch.credit_value = saleAmount;
        patch.metadata = { ...(patch.metadata ?? (detailFor.metadata as any) ?? {}), sale_value: saleAmount, sale_date: saleDate };
        const dateLabel = new Date(`${saleDate}T12:00:00`).toLocaleDateString("pt-BR");
        const valueLabel = saleAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        lines.push(`[${nowStamp}] Fechou negócio · ${valueLabel} · Data da venda: ${dateLabel}`);
      }

      if (has("nao_fechou")) {
        patch.stage = "perdido";
        patch.status = "lost";
        patch.qualification_status = "desqualificado";
        patch.disqualification_reason = notFechouReason.trim();
        lines.push(`[${nowStamp}] Não fechou: ${notFechouReason.trim()}`);
      }
      patch.notes = `${prevNotes}${lines.join("\n")}`;
      await update.mutateAsync({ id: detailFor.id, patch });

      // Registra as atualizações de etapa para o feed em tempo real do painel.
      try {
        const evMemberId = (detailFor as any).assigned_member_id ?? member?.id ?? null;
        const evMemberName =
          tenantMembers.find((tm) => tm.id === evMemberId)?.display_name ?? member?.display_name ?? null;
        const rows = lines.map((line) => ({
          tenant_id: (detailFor as any).tenant_id,
          lead_id: detailFor.id,
          lead_name: detailFor.name ?? detailFor.phone ?? "Lead",
          member_id: evMemberId,
          member_name: evMemberName,
          label: line.replace(/^\[[^\]]*\]\s*/, ""),
          stage: patch.stage ?? detailFor.stage ?? null,
        }));
        if (rows.length > 0) await supabase.from("lead_stage_events").insert(rows);
      } catch (err) {
        console.warn("lead_stage_events", err);
      }

      toast({ title: "Status atualizado" });
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
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      toast({ title: "Informe o telefone", variant: "destructive" });
      return;
    }
    if (!memberId && !effectiveUserId) {
      toast({
        title: "Sessão não identificada",
        description: "Não foi possível vincular o lead a você. Recarregue a página e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { data, error } = await supabase.rpc("claim_manual_lead", {
        _phone: cleanPhone,
        _name: name || undefined,
        _email: email || undefined,
        _member_id: memberId ?? undefined,
        _user_id: effectiveUserId ?? undefined,
      });

      if (error) {
        if (error.message?.includes("already_in_service_by_other")) {
          toast({
            title: "Já existe atendimento",
            description: "Esse número já está sendo atendido por outro consultor com conversas em andamento.",
            variant: "destructive",
          });
          return;
        }
        if (error.message?.includes("invalid_phone")) {
          toast({ title: "Telefone inválido", variant: "destructive" });
          return;
        }
        throw error;
      }
      const action = (data as any)?.[0]?.action;
      toast({
        title: action === "reassigned" ? "Lead transferido para você" : action === "already_yours" ? "Lead já é seu" : "Lead criado",
        description: "Adicionado à sua lista.",
      });
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
          await create.mutateAsync({
            name,
            phone,
            email,
            assigned_member_id: memberId ?? null,
            assigned_to: effectiveUserId ?? null,
            source: "import",
          } as any);
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
              {pagedLeads.map((l) => {
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
                      onClick={() => setDetailFor(l)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <InitialsAvatar name={l.name ?? "?"} className="h-10 w-10 shrink-0 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{l.name ?? "Sem nome"}</span>
                          <TempBadge temperature={l.temperature} />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{displayPhone(l.phone, canViewPhoneFn(l as any))}</div>
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
                      </div>
                    </button>
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
                  {pagedLeads.map((l) => {
                    const o = outcomeMeta(l);
                    const la = l as any;
                    const qLbl = labelFor(QUALIFICATION_OPTIONS, la.qualification_status);
                    const qCls = la.qualification_status === "qualificado" ? "bg-success/10 text-success border-success/20"
                      : la.qualification_status === "desqualificado" ? "bg-destructive/10 text-destructive border-destructive/20"
                      : la.qualification_status === "oportunidade_futura" ? "bg-info/10 text-info border-info/20"
                      : "bg-muted text-muted-foreground border-border";
                    const assignedMember = la.assigned_member_id ? memberMap.get(la.assigned_member_id) : null;
                    void assignedMember;
                    return (
                      <tr
                        key={l.id}
                        className="align-middle cursor-pointer transition-colors hover:bg-muted/30"
                        onClick={() => setDetailFor(l)}
                      >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <InitialsAvatar name={l.name ?? "?"} className="h-9 w-9 shrink-0 text-xs" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-[13px]">{l.name ?? "Sem nome"}</div>
                                <div className="truncate text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{displayPhone(l.phone, canViewPhoneFn(l as any))}</div>
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
                              <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir conversa">
                                <Link to={`/conversas?lead=${l.id}`}><MessageCircle className="h-4 w-4" /></Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredLeads.length > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
                <span className="text-[11px] text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredLeads.length)} de {filteredLeads.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">{page}/{totalPages}</span>
                  <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}



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
              {noteFor?.name || "Lead"} {noteFor?.phone ? `· ${displayPhone(noteFor.phone, canViewPhoneFn(noteFor as any))}` : ""}
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
              {detailFor?.name || "Lead"} {detailFor?.phone ? `· ${displayPhone(detailFor.phone, canViewPhoneFn(detailFor as any))}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Status do atendimento</Label>
              <div className="grid gap-1.5">
                {ANNOTATION_OPTIONS.map((o) => {
                  const active = annotations.includes(o.value);
                  const isMeeting = o.value === "reuniao";
                  return (
                    <React.Fragment key={o.value}>
                      <button
                        type="button"
                        onClick={() => toggleAnnotation(o.value)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card hover:bg-muted/40"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1">{o.label}</span>
                      </button>
                      {isMeeting && annotations.includes("reuniao") && (
                        <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Data da reunião</Label>
                            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Horário</Label>
                            <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs">Closer da reunião</Label>
                            <Select value={meetingCloser} onValueChange={setMeetingCloser}>
                              <SelectTrigger><SelectValue placeholder="Quem vai conduzir?" /></SelectTrigger>
                              <SelectContent>
                                {CLOSERS.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Marque quantas opções precisar. O sistema atualiza o pipeline automaticamente.
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
              <Label className="text-xs">Valor do lead (R$)</Label>
              <Input
                inputMode="decimal"
                value={leadValue}
                onChange={(e) => setLeadValue(e.target.value)}
                placeholder="Ex.: 120000"
              />
              <p className="text-[11px] text-muted-foreground">
                Reconhecido automaticamente quando disponível. Ajuste se precisar — aparece na agenda do closer.
              </p>
            </div>


            {annotations.includes("fechou") && (
              <div className="grid gap-3 rounded-lg border border-success/30 bg-success/5 p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor da venda (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={saleValue}
                    onChange={(e) => setSaleValue(e.target.value)}
                    placeholder="Ex.: 80000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data da venda</Label>
                  <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                </div>
              </div>
            )}


            {annotations.includes("nao_fechou") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Por que não fechou?</Label>
                <Textarea
                  value={notFechouReason}
                  onChange={(e) => setNotFechouReason(e.target.value)}
                  placeholder="Explique brevemente o motivo…"
                  rows={3}
                />
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
