import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Loader2, RefreshCw, Phone, Mail, Inbox, CheckCircle2, Clock, XCircle, Trophy, MessageCircle, ArrowLeft, Search, X, Send, ArrowRightLeft, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "./PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantMembers, useAssumeLead } from "@/hooks/useData";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { canTakeLead, getMaxAllowedForName, formatBRL } from "@/lib/leadTier";
import { LeadProgressBar } from "@/components/oticaflow/LeadProgressBar";

function normalizeRole(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function isConsultantLike(roleLabel?: string | null, username?: string | null) {
  const v = normalizeRole(`${roleLabel ?? ""} ${username ?? ""}`);
  // Apenas donos/proprietários são excluídos da lista de destinatários.
  // Supervisores também atendem leads e podem receber atribuições.
  if (/(dono|owner|proprietario)/.test(v)) return false;
  return true;
}

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  source: string | null;
  metadata: any;
  created_at: string;
  stage: string | null;
  assigned_to: string | null;
  assigned_member_id: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  atendimento: "Em atendimento",
  qualificado: "Qualificado",
  agendado: "Agendado",
  compareceu: "Compareceu",
  comprou: "Fechou negócio",
  perdido: "Perdido",
};

type TransferRequest = {
  id: string;
  lead_id: string;
  requester_member_id: string;
  owner_member_id: string;
  status: string;
  message: string | null;
  created_at: string;
};

function formatPhone(raw: string | null) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return raw;
}

function platformLabel(lead: Lead) {
  const raw = lead.metadata?.raw_row;
  if (Array.isArray(raw)) {
    // Column H = index 7 (platform)
    const v = raw[7];
    if (v && String(v).trim()) return String(v).trim().toUpperCase();
  }
  return (lead.source || "META ADS").toUpperCase();
}

export default function FilaLeadsPage() {
  const { user, tenantId, isSuperadmin, isOwner } = useAuth();
  const { member: activeMember } = useActiveMember();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canSendToOthers = can("assume_any_lead");
  const { data: members = [] } = useTenantMembers();
  const consultants = members.filter((m) => isConsultantLike(m.role_label, m.username) && m.receives_leads !== false);
  const assumeMut = useAssumeLead();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const [notifiedByLead, setNotifiedByLead] = useState<Record<string, string[]>>({});
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<Lead | null>(null);
  const [actionStep, setActionStep] = useState<"main" | "done" | "problem">("main");
  const [problemFor, setProblemFor] = useState<Lead | null>(null);
  const [problemText, setProblemText] = useState("");
  const [search, setSearch] = useState("");
  const [extraLeads, setExtraLeads] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);
  const [transferFor, setTransferFor] = useState<Lead | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"disponiveis" | "meus">("meus");

  useEffect(() => {
    if (activeTab !== "meus") setActiveTab("meus");
  }, [activeTab]);

  // Busca server-side em todos os estágios quando o usuário digita
  useEffect(() => {
    const q = search.trim();
    if (!q || !tenantId) {
      setExtraLeads([]);
      setSearching(false);
      return;
    }
    if (!canSendToOthers && !activeMember?.id) return;
    setSearching(true);
    const handle = setTimeout(async () => {
      const digits = q.replace(/\D/g, "");
      let query = supabase
        .from("leads")
        .select("id,name,phone,email,interest,source,metadata,created_at,stage,assigned_to,assigned_member_id,tenant_id")
        .in("source", ["meta_ads", "importacao_planilha"])
        .limit(50);
      // Superadmin pesquisa em todos os tenants.
      if (!isSuperadmin) query = query.eq("tenant_id", tenantId);
      if (!canSendToOthers) query = query.eq("assigned_member_id", activeMember!.id);
      const orParts = [
        `name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `interest.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
      ];
      if (digits) orParts.push(`phone.ilike.%${digits}%`);
      const { data } = await query.or(orParts.join(","));
      setExtraLeads((data as any) || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, tenantId, isSuperadmin, canSendToOthers, activeMember?.id]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("display_name, full_name, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const d: any = data;
        setMyDisplayName(d?.display_name || d?.full_name || d?.username || null);
      });
  }, [user?.id]);

  function tierCheck(lead: Lead) {
    return canTakeLead({
      consultantName: myDisplayName,
      leadInterest: lead.interest,
      bypass: canSendToOthers,
    });
  }

  async function sendLeadTo(lead: Lead, memberId: string, memberName: string) {
    const check = canTakeLead({
      consultantName: memberName,
      leadInterest: lead.interest,
      bypass: false,
    });
    if (!check.allowed) {
      toast.error(`${memberName} ${check.reason?.toLowerCase() || "não está habilitado para este lead."}`);
      return;
    }
    try {
      await assumeMut.mutateAsync({ leadId: lead.id, memberId });
      toast.success(`Lead enviado para ${memberName}.`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar lead.");
    }
  }


  const normalized = search.trim().toLowerCase();
  const digitsQuery = normalized.replace(/\D/g, "");
  const searchMatch = (l: Lead) => {
    if (!normalized) return true;
    const name = (l.name || "").toLowerCase();
    const email = (l.email || "").toLowerCase();
    const interest = (l.interest || "").toLowerCase();
    const phoneDigits = (l.phone || "").replace(/\D/g, "");
    if (name.includes(normalized) || email.includes(normalized) || interest.includes(normalized)) return true;
    if (digitsQuery && phoneDigits.includes(digitsQuery)) return true;
    return false;
  };
  const isLeadMine = (l: Lead) => {
    if (l.assigned_member_id) return !!activeMember?.id && l.assigned_member_id === activeMember.id;
    if (l.assigned_to) return l.assigned_to === user?.id;
    return false;
  };
  const mergedLeads = (() => {
    if (!normalized || extraLeads.length === 0) return leads;
    const ids = new Set(leads.map((l) => l.id));
    return [...leads, ...extraLeads.filter((l) => !ids.has(l.id))];
  })();
  const myLeads = mergedLeads.filter(isLeadMine);
  const availableLeads: Lead[] = [];
  const sourceLeads = myLeads;
  const filteredLeads = sourceLeads.filter(searchMatch);



  async function load() {
    if (!tenantId && !isSuperadmin) return;
    if (!canSendToOthers && !activeMember?.id) {
      setLeads([]);
      setAssigneeNames({});
      setNotifiedByLead({});
      setTransferRequests([]);
      setLoading(false);
      return;
    }
    let query = supabase
      .from("leads")
      .select("id,name,phone,email,interest,source,metadata,created_at,stage,assigned_to,assigned_member_id,tenant_id")
      .not("stage", "in", "(perdido,comprou,historico)")
      .in("source", ["meta_ads", "importacao_planilha"]);
    // Superadmin vê leads importados de todos os tenants.
    if (!isSuperadmin) query = query.eq("tenant_id", tenantId!);
    if (!canSendToOthers) query = query.eq("assigned_member_id", activeMember!.id);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    const rows = (data as any) || [];
    setLeads(rows);

    const userIds = Array.from(new Set(rows.map((r: Lead) => r.assigned_to).filter(Boolean))) as string[];
    const memberIds = Array.from(new Set(rows.map((r: Lead) => r.assigned_member_id).filter(Boolean))) as string[];
    const map: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,full_name,email")
        .in("id", userIds);
      (profs || []).forEach((p: any) => {
        map[p.id] = p.display_name || p.full_name || p.email || "Consultor";
      });
    }
    if (memberIds.length) {
      const { data: mems } = await supabase
        .from("tenant_members")
        .select("id,display_name,username")
        .in("id", memberIds);
      (mems || []).forEach((m: any) => {
        map[m.id] = m.display_name || m.username || "Consultor";
      });
    }
    setAssigneeNames(map);

    // Carrega quais consultores foram notificados por faixa, para tagear na fila.
    const leadIds = rows.map((r: Lead) => r.id);
    const notifMap: Record<string, string[]> = {};
    if (leadIds.length) {
      let nq = supabase
        .from("lead_notifications")
        .select("lead_id, recipient_member_id")
        .eq("type", "consultant_tier_match")
        .in("lead_id", leadIds)
        .not("recipient_member_id", "is", null);
      if (!isSuperadmin && tenantId) nq = nq.eq("tenant_id", tenantId);
      const { data: notifs } = await nq;
      const notifMemberIds = Array.from(
        new Set((notifs || []).map((n: any) => n.recipient_member_id).filter(Boolean)),
      ) as string[];
      if (notifMemberIds.length) {
        const missing = notifMemberIds.filter((id) => !map[id]);
        if (missing.length) {
          const { data: mems2 } = await supabase
            .from("tenant_members")
            .select("id,display_name,username")
            .in("id", missing);
          (mems2 || []).forEach((m: any) => {
            map[m.id] = m.display_name || m.username || "Consultor";
          });
          setAssigneeNames({ ...map });
        }
      }
      (notifs || []).forEach((n: any) => {
        if (!n.lead_id || !n.recipient_member_id) return;
        const list = notifMap[n.lead_id] || (notifMap[n.lead_id] = []);
        if (!list.includes(n.recipient_member_id)) list.push(n.recipient_member_id);
      });
    }
    setNotifiedByLead(notifMap);

    // Carrega pedidos de transferência em aberto para os leads visíveis
    if (leadIds.length) {
      let trq = supabase
        .from("lead_transfer_requests")
        .select("id, lead_id, requester_member_id, owner_member_id, status, message, created_at")
        .eq("status", "pending")
        .in("lead_id", leadIds);
      if (!isSuperadmin && tenantId) trq = trq.eq("tenant_id", tenantId);
      const { data: reqs } = await trq;
      const list = (reqs ?? []) as TransferRequest[];
      setTransferRequests(list);
      const reqMemberIds = Array.from(
        new Set(list.map((r) => r.requester_member_id).filter((id) => id && !map[id])),
      ) as string[];
      if (reqMemberIds.length) {
        const { data: mems3 } = await supabase
          .from("tenant_members")
          .select("id,display_name,username")
          .in("id", reqMemberIds);
        (mems3 || []).forEach((m: any) => {
          map[m.id] = m.display_name || m.username || "Consultor";
        });
        setAssigneeNames({ ...map });
      }
    } else {
      setTransferRequests([]);
    }
    setLoading(false);
  }

  async function requestTransfer() {
    const lead = transferFor;
    if (!lead) return;
    if (!activeMember?.id) {
      toast.error("Selecione sua identidade interna para solicitar transferências.");
      return;
    }
    const ownerId = lead.assigned_member_id;
    if (!ownerId) {
      toast.error("Lead não possui responsável definido.");
      return;
    }
    if (ownerId === activeMember.id) {
      toast.error("Você já é o responsável por este lead.");
      return;
    }
    setTransferBusy(true);
    const { error } = await supabase.from("lead_transfer_requests").insert({
      tenant_id: tenantId!,
      lead_id: lead.id,
      requester_member_id: activeMember.id,
      owner_member_id: ownerId,
      message: transferMessage.trim() || null,
    });
    setTransferBusy(false);
    if (error) {
      const msg = /duplicate|unique/i.test(error.message)
        ? "Você já tem uma solicitação pendente para este lead."
        : error.message;
      toast.error(msg);
      return;
    }
    toast.success(`Solicitação enviada para ${assigneeNames[ownerId] || "o responsável"}.`);
    setTransferFor(null);
    setTransferMessage("");
    load();
  }

  async function resolveTransfer(req: TransferRequest, approve: boolean) {
    if (!activeMember?.id || activeMember.id !== req.owner_member_id) {
      toast.error("Apenas o responsável pode responder esta solicitação.");
      return;
    }
    if (approve) {
      // Transfere o lead para o solicitante
      const { error: upErr } = await supabase
        .from("leads")
        .update({
          assigned_member_id: req.requester_member_id,
          assigned_member_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.lead_id)
        .eq("assigned_member_id", activeMember.id);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
    }
    const { error } = await supabase
      .from("lead_transfer_requests")
      .update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? "Lead transferido." : "Solicitação recusada.");
    load();
  }


  useEffect(() => {
    if (!tenantId) return;
    load();
    const ch = supabase
      .channel(`fila-leads-${tenantId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `tenant_id=eq.${tenantId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_transfer_requests", filter: `tenant_id=eq.${tenantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId, canSendToOthers, activeMember?.id]);

  async function syncNow() {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("sheets-sync", { body: {} });
    setSyncing(false);
    if (error) return toast.error("Falha: " + error.message);
    toast.success("Sincronização disparada");
    load();
  }

  async function claim(lead: Lead): Promise<boolean> {
    if (!user) {
      toast.error("Sessão expirada");
      return false;
    }
    const newStage = lead.stage && lead.stage !== "novo" ? lead.stage : "atendimento";
    const updatePayload: { assigned_to: string; stage: string; assigned_member_id?: string } = { assigned_to: user.id, stage: newStage };
    if (activeMember?.id) updatePayload.assigned_member_id = activeMember.id;
    const { data, error } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", lead.id)
      .is("assigned_to", null)
      .is("assigned_member_id", null)
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (!data) {
      toast.error("Outro vendedor já assumiu este lead");
      load();
      return false;
    }
    return true;
  }

  async function takeLead(lead: Lead) {
    if (isLeadMine(lead)) {
      navigate(`/conversas?lead=${lead.id}`);
      return;
    }
    const chk = tierCheck(lead);
    if (!chk.allowed) {
      toast.error(chk.reason || "Você ainda não está habilitado para este lead.");
      return;
    }
    setActingId(lead.id);
    const ok = await claim(lead);
    setActingId(null);
    if (ok) {
      toast.success("Lead atribuído a você");
      navigate(`/conversas?lead=${lead.id}`);
    }
  }

  async function markInProgress(lead: Lead) {
    if (isLeadMine(lead)) {
      setActingId(lead.id);
      let update = supabase
        .from("leads")
        .update({ stage: "atendimento", last_interaction_at: new Date().toISOString() })
        .eq("id", lead.id);
      update = lead.assigned_member_id && activeMember?.id
        ? update.eq("assigned_member_id", activeMember.id)
        : update.eq("assigned_to", user!.id);
      const { error } = await update;
      setActingId(null);
      if (error) return toast.error(error.message);
      toast.success("Marcado como em atendimento");
      load();
      return;
    }
    const chk = tierCheck(lead);
    if (!chk.allowed) {
      toast.error(chk.reason || "Você ainda não está habilitado para este lead.");
      return;
    }
    setActingId(lead.id);
    const ok = await claim(lead);
    setActingId(null);
    if (ok) toast.success("Marcado como em atendimento");
  }

  async function markWon(lead: Lead) {
    if (!user) return toast.error("Sessão expirada");
    setActingId(lead.id);
    const { error } = await supabase
      .from("leads")
      .update({
        assigned_to: user.id,
        stage: "comprou",
        status: "won",
        last_interaction_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    setActingId(null);
    if (error) return toast.error(error.message);
    toast.success("Negócio fechado! 🎉");
  }

  async function submitProblem() {
    if (!problemFor || !user) return;
    const text = problemText.trim();
    if (text.length < 3) return toast.error("Descreva o problema (mín. 3 caracteres)");
    if (text.length > 1000) return toast.error("Máximo 1000 caracteres");
    setActingId(problemFor.id);
    const { error } = await supabase
      .from("leads")
      .update({
        assigned_to: user.id,
        stage: "perdido",
        status: "lost",
        notes: text,
        last_interaction_at: new Date().toISOString(),
      })
      .eq("id", problemFor.id);
    setActingId(null);
    if (error) return toast.error(error.message);
    try {
      await supabase.functions.invoke("notify-supervisors", {
        body: { lead_id: problemFor.id, note: text, outcome: "Não fechou" },
      });
    } catch (e) { console.warn("notify-supervisors failed", e); }
    toast.success("Atendimento finalizado e supervisores notificados");
    setProblemFor(null);
    setProblemText("");
  }

  return (
    <>
      <PageHeader
        title="Leads do Anúncio"
        subtitle="Leads novos importados do Google Sheets, prontos para contato"
        actions={
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing} className="hidden rounded-full md:inline-flex">
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar com anúncio
          </Button>
        }
      />

      <div className="space-y-4 p-4 pb-24 md:p-8 md:pb-8">
        {!loading && canSendToOthers && (
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("disponiveis")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition md:text-sm ${
                activeTab === "disponiveis"
                  ? "bg-primary text-primary-foreground shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.6)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Disponíveis
              <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                activeTab === "disponiveis" ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
              }`}>
                {availableLeads.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("meus")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition md:text-sm ${
                activeTab === "meus"
                  ? "bg-primary text-primary-foreground shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.6)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Meus assumidos
              <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                activeTab === "meus" ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
              }`}>
                {myLeads.length}
              </span>
            </button>
          </div>
        )}

        {!loading && (sourceLeads.length > 0 || search) && (
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
                {filteredLeads.length} de {sourceLeads.length} {sourceLeads.length === 1 ? "lead" : "leads"}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sourceLeads.length === 0 ? (
          <div className="client-card rounded-2xl flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-50" />
            <div className="font-display text-base font-semibold text-foreground">
              {activeTab === "meus" ? "Nenhum lead atribuído a você" : "Nenhum lead disponível"}
            </div>
            <div className="text-sm">
              {activeTab === "meus"
                ? "Quando a distribuição automática destinar leads para você, eles aparecerão nesta lista."
                : "Os próximos leads aparecerão aqui automaticamente."}
            </div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="client-card rounded-2xl flex flex-col items-center justify-center gap-3 p-10 text-center text-muted-foreground">
            <Search className="h-8 w-8 opacity-50" />
            <div className="font-display text-sm font-semibold text-foreground">Nenhum resultado</div>
            <div className="text-xs">Tente outro nome, telefone ou email.</div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSearch("")}>Limpar busca</Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredLeads.map((lead) => (
              <div
                key={lead.id}
                className="client-card rounded-2xl p-3.5 md:p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-display text-sm font-semibold tracking-tight md:text-base truncate max-w-full">{lead.name || "Sem nome"}</h3>
                      <span className="inline-flex items-center rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-success">
                        {platformLabel(lead)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground md:text-sm">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{formatPhone(lead.phone)}</span>
                        </a>
                      )}
                      {lead.email && (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{lead.email}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {lead.interest && (
                        <div className="inline-flex max-w-full items-center rounded-full border border-hot/20 bg-hot/10 px-2 py-0.5 text-[11px] font-medium text-hot break-words">
                          <span className="break-words">Crédito: {lead.interest}</span>
                        </div>
                      )}
                      {(lead.assigned_member_id || lead.assigned_to) && (() => {
                        const assigneeId = lead.assigned_member_id || lead.assigned_to!;
                        const assigneeName = assigneeNames[assigneeId] || "Consultor";
                        const stageLabel = STAGE_LABELS[lead.stage || ""] || lead.stage || "Em atendimento";
                        const assigneeMember = lead.assigned_member_id
                          ? members.find((m) => m.id === lead.assigned_member_id)
                          : undefined;
                        return (
                          <>
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary whitespace-nowrap">
                              {assigneeMember ? (
                                <UserAvatar
                                  userId={assigneeMember.id}
                                  name={assigneeMember.display_name}
                                  avatarUrl={assigneeMember.avatar_url}
                                  avatarColor={assigneeMember.avatar_color}
                                  size={24}
                                />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                              )}
                              <span className="whitespace-nowrap">Atribuído a: {assigneeName}</span>
                            </div>
                            <div className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[11px] font-semibold text-info whitespace-nowrap">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="whitespace-nowrap">Fase: {stageLabel}</span>
                            </div>
                          </>
                        );
                      })()}
                      {(() => {
                        const memberRole = (activeMember?.role_label || "").toLowerCase();
                        const memberName = (activeMember?.display_name || "").toLowerCase();
                        const memberIsPrivileged = /dono|owner|propriet|supervisor/.test(memberRole);
                        const memberIsAntonio = memberName.includes("antonio") || memberName.includes("antônio");
                        const canSeeNotified = activeMember
                          ? (memberIsPrivileged || memberIsAntonio)
                          : (isSuperadmin || isOwner);
                        if (!canSeeNotified) return null;
                        const notified = notifiedByLead[lead.id] || [];
                        if (!notified.length) return null;
                        return notified.map((mid) => (
                          <div
                            key={mid}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                            title="Aviso disparado por faixa de crédito"
                          >
                            <Send className="h-3 w-3 shrink-0" />
                            <span className="break-words">Avisado: {assigneeNames[mid] || "Consultor"}</span>
                          </div>
                        ));
                      })()}
                      {(() => {
                        const CUTOFF = new Date("2026-05-22T17:44:01Z").getTime();
                        const isOld = new Date(lead.created_at).getTime() < CUTOFF;
                        const hasAssign = !!(lead.assigned_member_id || lead.assigned_to);
                        const hasNotif = (notifiedByLead[lead.id] || []).length > 0;
                        if (!isOld || hasAssign || hasNotif) return null;
                        return (
                          <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            Aguardando adm organizar as atribuições
                          </div>
                        );
                      })()}
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(lead.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="pt-1">
                      <LeadProgressBar stage={lead.stage} showPercent />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-nowrap">
                    {(() => {
                      const myCheck = tierCheck(lead);
                      const assignedMemberId = (lead as any).assigned_member_id ?? null;
                      // Fonte de verdade: assigned_member_id quando existir; senão assigned_to (legado).
                      const isMine = assignedMemberId
                        ? (!!activeMember?.id && assignedMemberId === activeMember.id)
                        : (!!lead.assigned_to && lead.assigned_to === user?.id);
                      const assignedToSomeone = !!assignedMemberId || !!lead.assigned_to;

                      if (assignedToSomeone && !isMine) {
                        const hasMyPendingReq = !!activeMember?.id && transferRequests.some(
                          (r) => r.lead_id === lead.id && r.requester_member_id === activeMember.id,
                        );
                        if (hasMyPendingReq) {
                          return (
                            <Button disabled size="sm" variant="outline" className="rounded-full h-9 px-4 text-xs md:h-10 md:px-5 md:text-sm">
                              <Clock className="mr-1.5 h-3.5 w-3.5" />
                              Aguardando resposta
                            </Button>
                          );
                        }
                        if (!activeMember?.id || !assignedMemberId) {
                          return (
                            <Button disabled size="sm" variant="outline" className="rounded-full h-9 px-4 text-xs md:h-10 md:px-5 md:text-sm">
                              Em atendimento
                            </Button>
                          );
                        }
                        return (
                          <Button
                            onClick={() => { setTransferFor(lead); setTransferMessage(""); }}
                            size="sm"
                            variant="outline"
                            className="rounded-full h-9 px-4 text-xs md:h-10 md:px-5 md:text-sm border-primary/40 text-primary hover:bg-primary/10"
                          >
                            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                            Solicitar transferência
                          </Button>
                        );
                      }

                      if (!myCheck.allowed && !isMine) {
                        return (
                          <Button
                            onClick={() => toast.error(myCheck.reason || "Você ainda não está habilitado para este lead.")}
                            size="sm"
                            variant="outline"
                            className="rounded-full h-9 px-4 text-xs md:h-10 md:px-5 md:text-sm border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                          >
                            Sem acesso
                          </Button>
                        );
                      }
                      return (
                        <Button
                          onClick={() => { setActionFor(lead); setActionStep("main"); }}
                          disabled={actingId === lead.id}
                          size="sm"
                          className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_22px_-10px_hsl(var(--primary)/0.6)] h-9 px-4 text-xs md:h-10 md:px-5 md:text-sm"
                        >
                          {actingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (isMine ? "Continuar" : "Pegar")}
                        </Button>
                      );
                    })()}
                    {canSendToOthers && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={assumeMut.isPending}
                            className="rounded-full h-9 px-3 text-xs md:h-10 md:px-4 md:text-sm"
                          >
                            <Send className="h-3.5 w-3.5 md:mr-1" />
                            <span className="hidden md:inline">Enviar</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto w-56">
                          <DropdownMenuLabel>Enviar lead para</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {consultants.filter((c) => c.id !== lead.assigned_to).map((c) => {
                            const chk = canTakeLead({ consultantName: c.display_name, leadInterest: lead.interest });
                            const maxFor = getMaxAllowedForName(c.display_name);
                            return (
                              <DropdownMenuItem
                                key={c.id}
                                disabled={!chk.allowed}
                                onSelect={(e) => {
                                  if (!chk.allowed) {
                                    e.preventDefault();
                                    toast.error(`${c.display_name} ${chk.reason?.toLowerCase() || "não habilitado para este lead."}`);
                                    return;
                                  }
                                  sendLeadTo(lead, c.id, c.display_name);
                                }}
                                className={!chk.allowed ? "opacity-60" : ""}
                              >
                                <UserAvatar
                                  userId={c.id}
                                  name={c.display_name}
                                  avatarUrl={c.avatar_url}
                                  avatarColor={c.avatar_color}
                                  size={24}
                                />
                                <span className="ml-2 truncate">{c.display_name}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {!chk.allowed
                                    ? `máx ${formatBRL(maxFor || 0)}`
                                    : (c.role_label || "")}
                                </span>
                              </DropdownMenuItem>
                            );
                          })}
                          {consultants.filter((c) => c.id !== lead.assigned_to).length === 0 && (
                            <DropdownMenuItem disabled>Nenhum consultor disponível</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {(() => {
                    const incoming = transferRequests.filter(
                      (r) => r.lead_id === lead.id && !!activeMember?.id && r.owner_member_id === activeMember.id,
                    );
                    if (!incoming.length) return null;
                    return (
                      <div className="mt-3 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          {incoming.length === 1 ? "Pedido de transferência" : "Pedidos de transferência"}
                        </div>
                        {incoming.map((req) => (
                          <div key={req.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 text-xs">
                              <div className="font-medium text-foreground">
                                {assigneeNames[req.requester_member_id] || "Consultor"} quer assumir este lead
                              </div>
                              {req.message && (
                                <div className="mt-0.5 text-muted-foreground line-clamp-2">"{req.message}"</div>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full h-8 px-3 text-xs"
                                onClick={() => resolveTransfer(req, false)}
                              >
                                <X className="mr-1 h-3.5 w-3.5" />
                                Recusar
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-full h-8 px-3 text-xs bg-success text-success-foreground hover:bg-success/90"
                                onClick={() => resolveTransfer(req, true)}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" />
                                Liberar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!actionFor} onOpenChange={(o) => { if (!o) { setActionFor(null); setActionStep("main"); } }}>
        <DialogContent className="gap-0 p-0 max-w-[calc(100%-1rem)] sm:max-w-sm rounded-2xl overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 text-left space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              {actionStep !== "main" && (
                <button
                  type="button"
                  onClick={() => setActionStep("main")}
                  className="-ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <span className="truncate">
                {actionStep === "main" && (actionFor?.name || "Lead")}
                {actionStep === "done" && "Resultado do atendimento"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {actionStep === "main" && (actionFor?.phone || "O que você quer fazer?")}
              {actionStep === "done" && "Como foi o atendimento?"}
            </DialogDescription>
          </DialogHeader>

          {actionStep === "main" && actionFor && (
            <div className="flex flex-col gap-2 px-3 pb-4">
              <button
                type="button"
                disabled={actingId === actionFor.id}
                onClick={async () => { const lead = actionFor; await takeLead(lead); setActionFor(null); }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:bg-muted disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{isLeadMine(actionFor) ? "Abrir conversa" : "Pegar e abrir conversa"}</span>
                  <span className="block text-xs text-muted-foreground truncate">{isLeadMine(actionFor) ? "Ir para o chat deste lead" : "Atribui a você e vai para o chat"}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={actingId === actionFor.id}
                onClick={async () => { const lead = actionFor; await markInProgress(lead); setActionFor(null); }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:bg-muted disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
                  <Clock className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">Em atendimento</span>
                  <span className="block text-xs text-muted-foreground truncate">{isLeadMine(actionFor) ? "Atualiza a fase do lead" : "Atribui sem abrir o chat"}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={actingId === actionFor.id}
                onClick={() => setActionStep("done")}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:bg-muted disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">Já atendido</span>
                  <span className="block text-xs text-muted-foreground truncate">Finalizar este lead</span>
                </span>
              </button>
            </div>
          )}

          {actionStep === "done" && actionFor && (
            <div className="flex flex-col gap-2 px-3 pb-4">
              <button
                type="button"
                disabled={actingId === actionFor.id}
                onClick={async () => { const lead = actionFor; await markWon(lead); setActionFor(null); setActionStep("main"); }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:bg-muted disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Trophy className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">Fechou negócio</span>
                  <span className="block text-xs text-muted-foreground truncate">Marcar como ganho</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setProblemFor(actionFor); setProblemText(""); setActionFor(null); setActionStep("main"); }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition active:scale-[0.98] hover:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <XCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">Não fechou</span>
                  <span className="block text-xs text-muted-foreground truncate">Descrever o problema</span>
                </span>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!problemFor} onOpenChange={(o) => { if (!o) { setProblemFor(null); setProblemText(""); } }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">O que aconteceu?</DialogTitle>
            <DialogDescription className="text-xs">
              Descreva por que {problemFor?.name || "este lead"} não fechou.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={problemText}
            onChange={(e) => setProblemText(e.target.value)}
            maxLength={1000}
            placeholder="Ex.: cliente sem crédito aprovado, achou caro, vai pensar..."
            className="min-h-[120px] text-sm"
          />
          <div className="text-right text-[11px] text-muted-foreground">{problemText.length}/1000</div>
          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setProblemFor(null); setProblemText(""); }}>
              Cancelar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={submitProblem} disabled={actingId === problemFor?.id}>
              {actingId === problemFor?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferFor} onOpenChange={(o) => { if (!o) { setTransferFor(null); setTransferMessage(""); } }}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-md rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">Solicitar transferência</DialogTitle>
            <DialogDescription className="text-xs">
              {transferFor?.assigned_member_id
                ? `${assigneeNames[transferFor.assigned_member_id] || "O responsável atual"} será notificado e decide se libera o lead.`
                : "O responsável atual será notificado e decide se libera o lead."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={transferMessage}
            onChange={(e) => setTransferMessage(e.target.value)}
            maxLength={500}
            placeholder="Motivo (opcional): por que você quer assumir este lead?"
            className="min-h-[100px] text-sm"
          />
          <div className="text-right text-[11px] text-muted-foreground">{transferMessage.length}/500</div>
          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setTransferFor(null); setTransferMessage(""); }}>
              Cancelar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={requestTransfer} disabled={transferBusy}>
              {transferBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-black/5 bg-white/95 p-3 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur md:hidden">
        <Button onClick={syncNow} disabled={syncing} className="w-full rounded-full">
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar com anúncio
        </Button>
      </div>
    </>
  );
}
