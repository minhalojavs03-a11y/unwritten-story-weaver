import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowLeft, Send, Sparkles, MoreVertical, Check, CheckCheck, X, BellOff, Bell, Ban, Copy, ExternalLink, Kanban, Zap, Plus, Mic, Square, Trash2, Paperclip, FileText, Image as ImageIcon, Film, PanelRight, Phone, Mail, User as UserIcon, Calendar, Tag, Clock, Pencil } from "lucide-react";
import { TempBadge } from "@/components/oticaflow/TempBadge";
import { LeadProgressBar } from "@/components/oticaflow/LeadProgressBar";
import { StageBadge } from "@/components/oticaflow/StageBadge";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatTime, timeAgo } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useConversations, useMessages, useSendMessage, useAssumeLead, useReleaseLead, useTenantMembers } from "@/hooks/useData";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link as RLink } from "react-router-dom";
import { useTemplates, renderTemplate } from "@/hooks/useTemplates";
import type { Tables } from "@/integrations/supabase/types";

const tabs: { id: "all" | "hot" | "unread"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "hot", label: "🔥 Quentes" },
  { id: "unread", label: "⏰ Não lidas" },
];

export default function ConversasPage() {
  const { tenantId, isSuperadmin, isOwner, user } = useAuth();
  const { member } = useActiveMember();
  const { can } = usePermissions();
  const canViewAll = isSuperadmin || isOwner || can("view_all_leads");
  const userId = user?.id ?? null;
  const [params, setParams] = useSearchParams();
  const leadParam = params.get("lead");
  const tabParam = params.get("tab");
  const initialTab: (typeof tabs)[number]["id"] =
    tabParam === "hot" || tabParam === "unread" || tabParam === "all" ? tabParam : "all";
  const [tab, setTabState] = useState<(typeof tabs)[number]["id"]>(initialTab);
  const setTab = (id: (typeof tabs)[number]["id"]) => {
    setTabState(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === "all") next.delete("tab"); else next.set("tab", id);
      return next;
    }, { replace: true });
  };
  // Mantém o tab sincronizado quando a URL muda (ex.: navegação a partir do Dashboard)
  useEffect(() => {
    const t = params.get("tab");
    const valid = t === "hot" || t === "unread" || t === "all" ? t : "all";
    setTabState((prev) => (prev === valid ? prev : valid));
  }, [params]);
  const [query, setQuery] = useState("");
  const { data: conversations = [], isLoading } = useConversations();
  const queryClient = useQueryClient();
  const autoImportAttemptedRef = useRef(false);

  useEffect(() => {
    if (!tenantId || isLoading || autoImportAttemptedRef.current) return;
    autoImportAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      const { count: messageCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (cancelled || (conversations.length > 0 && (messageCount ?? 0) > 0)) return;
      // Só importa histórico de instâncias que ainda não passaram pelo sync inicial
      // e que NÃO foram marcadas como "auto_history_import_disabled" (ex.: número
      // de teste já limpo manualmente). Sem essa trava o /conversas reimportava
      // os contatos toda vez que o tenant aparecia vazio.
      const { data: connectedInstances } = await supabase
        .from("whatsapp_instances")
        .select("id, metadata")
        .eq("tenant_id", tenantId)
        .or("is_connected.eq.true,status.eq.connected")
        .limit(3);
      if (cancelled || !connectedInstances?.length) return;
      const importable = (connectedInstances as Array<{ id: string; metadata: Record<string, unknown> | null }>).filter((inst) => {
        const meta = (inst.metadata ?? {}) as Record<string, unknown>;
        if (meta.auto_history_import_disabled === true) return false;
        if (meta.history_sync_completed_at) return false;
        return true;
      });
      if (cancelled || importable.length === 0) return;
      toast({ title: "Importando conversas do WhatsApp", description: "Número conectado encontrado. As conversas vão aparecer aqui." });
      await Promise.allSettled(importable.map((i) => supabase.functions.invoke("whatsapp-manage", {
        body: { action: "sync-history", instance_id: i.id, maxChats: 80, msgsPerChat: 20 },
      })));
      if (cancelled) return;
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    })();
    return () => { cancelled = true; };
  }, [tenantId, isLoading, conversations.length, queryClient]);


  // Leads atribuídos sem linha em "conversations" ainda.
  // Consultor restrito: apenas próprios leads. Dono/supervisor/superadmin: todos do tenant
  // (para enxergar leads importados atribuídos a outros consultores, ex.: Kauana).
  const [assignedLeads, setAssignedLeads] = useState<any[]>([]);
  useEffect(() => {
    if (!tenantId) { setAssignedLeads([]); return; }
    const memberRole = (member?.role_label || "").toLowerCase();
    const memberCanViewAll = /dono|owner|propriet|supervisor/.test(memberRole);
    const canSeeAll = member ? memberCanViewAll : canViewAll;
    const restricted = !canSeeAll;
    if (restricted && !member?.id && !userId) { setAssignedLeads([]); return; }
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("leads")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (restricted) {
        if (member?.id) q = q.eq("assigned_member_id", member.id);
        else if (userId) q = q.eq("assigned_to", userId);
      } else {
        q = q.not("assigned_member_id", "is", null);
      }
      const { data } = await q;
      if (!cancelled) setAssignedLeads(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [tenantId, member?.id, member?.role_label, canViewAll, userId, conversations]);

  // Dado leadId da URL, encontra/garante uma conversa (busca direta + fallback de criação)
  const [fetchedActive, setFetchedActive] = useState<any | null>(null);
  useEffect(() => {
    if (!leadParam) { setFetchedActive(null); return; }
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      // Trava de privacidade: consultor restrito só pode abrir leads atribuídos a ele.
      // Owners / supervisores / superadmins seguem com acesso total.
      const memberRole = (member?.role_label || "").toLowerCase();
      const memberCanViewAll = /dono|owner|propriet|supervisor/.test(memberRole);
      const restricted = member ? !memberCanViewAll : !canViewAll;
      if (restricted) {
        const { data: leadCheck } = await supabase
          .from("leads")
          .select("assigned_member_id, assigned_to, tenant_id")
          .eq("id", leadParam)
          .maybeSingle();
        if (cancelled) return;
        const ownsByMember = member?.id && leadCheck?.assigned_member_id === member.id;
        const ownsByUser = userId && leadCheck?.assigned_to === userId;
        if (!leadCheck || leadCheck.tenant_id !== tenantId || (!ownsByMember && !ownsByUser)) {
          setFetchedActive(null);
          setParams({}, { replace: true });
          toast({ title: "Acesso negado", description: "Esta conversa pertence a outro consultor.", variant: "destructive" });
          return;
        }
      }

      const { data: existing } = await supabase
        .from("conversations")
        .select("*, lead:leads(*)")
        .eq("lead_id", leadParam)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (existing) { setFetchedActive(existing); return; }
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({ tenant_id: tenantId, lead_id: leadParam })
        .select("*, lead:leads(*)")
        .single();
      if (!cancelled && !error && created) setFetchedActive(created);
    })();
    return () => { cancelled = true; };
  }, [leadParam, tenantId, member?.id, member?.role_label, canViewAll, userId, setParams]);

  const activeConvId = fetchedActive?.id ?? null;

  const filtered = useMemo(() => {
    // Dedupe por lead_id mantendo a conversa mais recente (defesa contra duplicatas legadas)
    const byLead = new Map<string, any>();
    for (const c of conversations as any[]) {
      const key = c.lead_id ?? c.id;
      const prev = byLead.get(key);
      const curTs = new Date(c.last_message_at ?? c.created_at ?? 0).getTime();
      const prevTs = prev ? new Date(prev.last_message_at ?? prev.created_at ?? 0).getTime() : -1;
      if (!prev || curTs > prevTs) byLead.set(key, c);
    }
    // Inclui leads atribuídos sem conversa ainda (entradas sintéticas)
    const existingLeadIds = new Set(Array.from(byLead.values()).map((c: any) => c.lead_id).filter(Boolean));
    for (const l of assignedLeads) {
      if (!existingLeadIds.has(l.id)) {
        byLead.set(l.id, {
          id: `virtual:${l.id}`,
          lead_id: l.id,
          tenant_id: l.tenant_id,
          last_message_at: l.assigned_member_at ?? l.created_at,
          last_message_preview: null,
          unread_count: 0,
          lead: l,
          __virtual: true,
        });
      }
    }
    return Array.from(byLead.values())
      .sort((a, b) => new Date(b.last_message_at ?? b.created_at ?? 0).getTime() - new Date(a.last_message_at ?? a.created_at ?? 0).getTime())
      .filter((c: any) => {
        const lead = c.lead;
        const memberRole = (member?.role_label || "").toLowerCase();
        const memberCanViewAll = /dono|owner|propriet|supervisor/.test(memberRole);
        const shouldRestrict = member ? !memberCanViewAll : !canViewAll;
        if (shouldRestrict) {
          const assignedMemberId = lead?.assigned_member_id ?? null;
          const assignedUserId = lead?.assigned_to ?? null;
          const ownsByMember = member?.id && assignedMemberId === member.id;
          const ownsByUser = userId && assignedUserId === userId;
          if (!ownsByMember && !ownsByUser) return false;
        }
        if (query) {
          const q = query.trim().toLowerCase();
          const qDigits = q.replace(/\D/g, "");
          const name = (lead?.name ?? "").toLowerCase();
          const phone = (lead?.phone ?? "").toLowerCase();
          const phoneDigits = phone.replace(/\D/g, "");
          const email = (lead?.email ?? "").toLowerCase();
          const matchesText = name.includes(q) || phone.includes(q) || email.includes(q);
          const matchesPhone = qDigits.length > 0 && phoneDigits.includes(qDigits);
          if (!matchesText && !matchesPhone) return false;
        }
        if (tab === "hot") return lead?.temperature === "hot";
        if (tab === "unread") return (c.unread_count ?? 0) > 0;
        return true;
      });
  }, [conversations, assignedLeads, query, tab, canViewAll, member?.id, member?.role_label, userId]);

  const active = conversations.find((c: any) => c.id === activeConvId) ?? fetchedActive;

  const [showInfo, setShowInfo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("conv_show_info") !== "0";
  });
  useEffect(() => {
    try { window.localStorage.setItem("conv_show_info", showInfo ? "1" : "0"); } catch {}
  }, [showInfo]);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-hidden bg-[#f0f2f5]">
      {/* Sidebar de conversas — estilo WhatsApp */}
      <div className={cn("wa-list flex w-full min-w-0 flex-col md:w-[420px] md:shrink-0", active && "hidden md:flex")}>
        <div className="wa-list-search px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54656f]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar conversa"
              className="h-9 w-full rounded-lg bg-white pl-10 pr-3 text-sm text-[#111b21] placeholder:text-[#667781] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-[#d9fdd3] text-[#1d6f5c]"
                  : "bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]")}>
              {t.label}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {isLoading && <li className="p-8 text-center text-sm text-[#667781]">Carregando…</li>}
          {!isLoading && filtered.length === 0 && (
            <li className="p-8 text-center text-sm text-[#667781]">
              Nenhuma conversa ainda.
            </li>
          )}
          {filtered.map((c: any) => {
            const lead = c.lead;
            const isActive = activeConvId === c.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => { setParams({ lead: c.lead_id }); }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[#f5f6f6]",
                    isActive && "wa-list-item-active"
                  )}
                >
                  <InitialsAvatar name={lead?.name ?? "?"} src={(lead as any)?.avatar_url} className="bg-[#dfe5e7] text-[#54656f]" />
                  <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-medium text-[#111b21]">{lead?.name ?? lead?.phone}</span>
                      <span className={cn("shrink-0 text-[11px]", (c.unread_count ?? 0) > 0 ? "text-[#00a884] font-medium" : "text-[#667781]")}>
                        {c.last_message_at ? timeAgo(c.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px] text-[#667781]">{c.last_message_preview ?? "—"}</p>
                      {(c.unread_count ?? 0) > 0 && (
                        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {((lead as any)?.metadata?.imported_from_history || (c as any)?.metadata?.imported_from_history) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          📦 Lead antigo
                        </span>
                      )}
                      {lead && <TempBadge temperature={lead.temperature} />}
                      {lead && <StageBadge stage={lead.stage} />}
                    </div>
                    {lead && (
                      <div className="mt-2 opacity-70">
                        <LeadProgressBar temperature={lead.temperature} stage={lead.stage} size="sm" showMarker={false} />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Painel de chat */}
      <div className={cn("min-h-0 min-w-0 flex-1 flex-col overflow-hidden", active ? "flex" : "hidden md:flex")}>
        {!active ? (
          <EmptyState />
        ) : (
          <ConversationDetail
            conv={active}
            onBack={() => setParams({})}
            showInfo={showInfo}
            onToggleInfo={() => setShowInfo((v) => !v)}
          />
        )}
      </div>

      {/* Painel lateral direito — perfil do lead (CRM) */}
      {active && showInfo && (
        <LeadInfoPanel conv={active} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#f0f2f5] text-center" style={{ borderTop: "6px solid #00a884" }}>
      <div className="max-w-md px-6">
        <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-[#e9edef]">
          <svg viewBox="0 0 24 24" className="h-20 w-20 text-[#c4ccd0]" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.97.57 3.81 1.55 5.36L2 22l4.78-1.52A9.96 9.96 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18a7.95 7.95 0 0 1-4.21-1.21l-.3-.18-2.84.9.9-2.78-.19-.31A7.95 7.95 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
        </div>
        <h2 className="text-2xl font-light text-[#41525d]">Consórcio Feracon · WhatsApp</h2>
        <p className="mt-3 text-sm text-[#667781]">
          Selecione uma conversa para ver as mensagens. Suas respostas chegam direto ao cliente.
        </p>
      </div>
    </div>
  );
}

function ConversationDetail({ conv, onBack, showInfo, onToggleInfo }: { conv: any; onBack: () => void; showInfo?: boolean; onToggleInfo?: () => void }) {
  const lead = conv.lead as Tables<"leads">;
  const { tenantId: ctxTenantId } = useAuth();
  const { data: messages = [] } = useMessages(
    conv.id?.startsWith?.("virtual:") ? null : conv.id,
    conv.lead_id ?? lead?.id ?? null,
    { leadPhone: lead?.phone ?? null, tenantId: conv.tenant_id ?? ctxTenantId ?? null }
  );
  const send = useSendMessage();
  const assume = useAssumeLead();
  const release = useReleaseLead();
  const { roles, session, isSuperadmin, user } = useAuth();
  const { member } = useActiveMember();
  const { data: members = [] } = useTenantMembers();
  const { data: allTemplates = [] } = useTemplates();
  const myShortcuts = allTemplates.filter((t) => !t.is_global);
  const [draft, setDraft] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [audioBusy, setAudioBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const recCancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledConvRef = useRef<string | null>(null);

  // Auto-scroll para o final ao abrir a conversa e quando chegar mensagem nova.
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const convKey = conv?.id ?? null;
    const isNewConv = lastScrolledConvRef.current !== convKey;
    if (isNewConv) {
      lastScrolledConvRef.current = convKey;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [conv?.id, messages.length]);

  const assignedId = (lead as any)?.assigned_member_id as string | null;
  const assignedUserId = (lead as any)?.assigned_to as string | null;
  const assignedMember = assignedId ? members.find((m) => m.id === assignedId) : null;
  const isMine = (!!assignedId && assignedId === member?.id) || (!!assignedUserId && assignedUserId === user?.id);
  const canOverride = isSuperadmin || (roles ?? []).some((r) => ["superadmin", "owner", "supervisor"].includes(r as string));
  const isLocked = (!!assignedId || !!assignedUserId) && !isMine && !canOverride;
  // Regra: lead livre, qualquer um pode pegar. Lead já atribuído a outro consultor
  // só pode ser assumido diretamente por owner/supervisor/superadmin. Demais devem
  // pedir transferência ao responsável atual (evita roubo silencioso de atendimento).
  const canAssume = !!member && !isMine && (!assignedId || canOverride);


  async function callManage(action: string, payload: Record<string, any> = {}) {
    const { error } = await supabase.functions.invoke("whatsapp-manage", {
      body: { action, phone: lead?.phone, ...payload },
    });
    if (error) throw error;
  }

  async function silenceAi(minutes: number) {
    try {
      await callManage("silence-ai", { minutes });
      toast({ title: `IA silenciada por ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}min`}` });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  }
  async function unsilenceAi() {
    try { await callManage("unsilence-ai"); toast({ title: "IA reativada" }); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  }
  async function blockContact() {
    if (!confirm(`Bloquear ${lead?.name ?? lead?.phone} no WhatsApp?`)) return;
    try { await callManage("block-contact"); toast({ title: "Contato bloqueado" }); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  }
  const qcInner = useQueryClient();
  async function deleteMessage(messageId: string, forEveryone: boolean) {
    try {
      await callManage("delete-message", { message_id: messageId, for_everyone: forEveryone });
      qcInner.invalidateQueries({ queryKey: ["messages", conv?.id] });
      toast({ title: forEveryone ? "Mensagem apagada para todos" : "Mensagem apagada" });
    } catch (e: any) {
      toast({ title: "Erro ao apagar", description: e.message, variant: "destructive" });
    }
  }
  function copyPhone() {
    if (!lead?.phone) return;
    navigator.clipboard.writeText(lead.phone);
    toast({ title: "Telefone copiado" });
  }

  const leadFirstName = (lead?.name ?? "").trim().split(/\s+/)[0] || "";
  function tryExpandShortcut(text: string): string | null {
    const m = text.match(/(^|\s)\/(\d{1,3})$/);
    if (!m) return null;
    const idx = parseInt(m[2], 10) - 1;
    const t = myShortcuts[idx];
    if (!t) return null;
    const body = renderTemplate(t.body ?? t.content ?? "", { nome: leadFirstName });
    return text.slice(0, (m.index ?? 0) + m[1].length) + body;
  }

  const sendingRef = useRef(false);
  async function handleSend() {
    if (sendingRef.current || send.isPending) return;
    const expanded = tryExpandShortcut(draft.trimEnd());
    if (expanded !== null) { setDraft(expanded); return; }
    const text = draft.trim();
    if (!text) return;
    sendingRef.current = true;
    setDraft(""); // limpa imediatamente para evitar reenvio por Enter/clique duplicado
    try {
      await send.mutateAsync({ conversationId: conv.id, leadId: conv.lead_id, body: text });
    } catch (e: any) {
      setDraft(text); // restaura em caso de falha
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      sendingRef.current = false;
    }
  }

  async function startRecording() {
    if (!member && !isSuperadmin) {
      toast({ title: "Selecione sua identidade interna para enviar áudio", variant: "destructive" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: "Microfone indisponível", description: "Seu navegador não suporta gravação de áudio.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // WhatsApp PTT exige OGG/Opus para tocar de forma confiável em todos os clientes (iPhone inclusive).
      // Só caímos para webm/mp4 quando o navegador não suporta ogg/opus nativamente.
      const mimeCandidates = ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = mimeCandidates.find((m) => (window as any).MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recChunksRef.current = [];
      recCancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setIsRecording(false);
        const chunks = recChunksRef.current;
        recChunksRef.current = [];
        if (recCancelRef.current || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        await uploadAndSendAudio(blob);
      };
      recorderRef.current = rec;
      setRecElapsed(0);
      setIsRecording(true);
      const startedAt = Date.now();
      recTimerRef.current = window.setInterval(() => {
        setRecElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      rec.start();
    } catch (e: any) {
      toast({ title: "Não foi possível acessar o microfone", description: e?.message, variant: "destructive" });
    }
  }

  function stopRecording(cancel = false) {
    recCancelRef.current = cancel;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
  }

  async function uploadAndSendAudio(blob: Blob) {
    setAudioBusy(true);
    let pendingMessageId: string | null = null;
    try {
      // Trava: precisa ser o responsável (ou ter override)
      const assignedNow = (lead as any)?.assigned_member_id as string | null;
      const assignedUserNow = (lead as any)?.assigned_to as string | null;
      const assignedToMe = (!!assignedNow && assignedNow === member?.id) || (!!assignedUserNow && assignedUserNow === user?.id);
      if ((assignedNow || assignedUserNow) && !assignedToMe && !canOverride) {
        throw new Error("Este lead já está sendo atendido por outro vendedor.");
      }
      if (!assignedNow && !assignedUserNow && member?.id) {
        await supabase.rpc("assume_lead", { _lead_id: lead.id, _member_id: member.id });
      }
      if (!assignedNow && !assignedUserNow && !member?.id && !canOverride) {
        throw new Error("Selecione sua identidade interna para enviar áudio.");
      }

      // Upload no bucket público
      const ext = (blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm");
      const path = `${conv.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("voice-messages").upload(path, blob, {
        contentType: blob.type || "audio/webm",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("voice-messages").getPublicUrl(path);
      const audioUrl = pub.publicUrl;

      // Insere mensagem pending
      const { data: inserted, error: insErr } = await supabase.from("messages").insert({
        tenant_id: lead.tenant_id,
        conversation_id: conv.id,
        lead_id: lead.id,
        direction: "outbound",
        body: "🎤 Mensagem de voz",
        media_url: audioUrl,
        message_type: "audio",
        sent_by: (await supabase.auth.getUser()).data.user?.id,
        status: "pending",
      }).select("id").maybeSingle();
      if (insErr) throw insErr;
      if (!inserted) throw new Error("Áudio idêntico registrado agora há pouco. Tente novamente em alguns segundos.");
      pendingMessageId = inserted.id;

      // Envia via uazapi
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");
      const { data: resp, error: fnErr } = await supabase.functions.invoke("whatsapp-manage", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: "send-audio",
          tenant_id: lead.tenant_id,
          phone: lead.phone,
          audio_url: audioUrl,
          ptt: true,
          message_id: inserted.id,
        },
      });
      if (fnErr || (resp as any)?.error) {
        const msg = (resp as any)?.error || fnErr?.message || "Falha ao enviar áudio";
        throw new Error(msg);
      }

      await supabase.from("conversations").update({
        last_message_preview: "🎤 Mensagem de voz",
        last_message_at: new Date().toISOString(),
      }).eq("id", conv.id);
    } catch (e: any) {
      if (pendingMessageId) {
        await supabase.from("messages").update({ status: "failed" }).eq("id", pendingMessageId);
      }
      toast({ title: "Erro ao enviar áudio", description: e.message, variant: "destructive" });
    } finally {
      setAudioBusy(false);
    }
  }

  async function uploadAndSendMedia(file: File) {
    setMediaBusy(true);
    let pendingMessageId: string | null = null;
    try {
      const assignedNow = (lead as any)?.assigned_member_id as string | null;
      const assignedUserNow = (lead as any)?.assigned_to as string | null;
      const assignedToMe = (!!assignedNow && assignedNow === member?.id) || (!!assignedUserNow && assignedUserNow === user?.id);
      if ((assignedNow || assignedUserNow) && !assignedToMe && !canOverride) {
        throw new Error("Este lead já está sendo atendido por outro vendedor.");
      }
      if (!assignedNow && !assignedUserNow && member?.id) {
        await supabase.rpc("assume_lead", { _lead_id: lead.id, _member_id: member.id });
      }
      if (!assignedNow && !assignedUserNow && !member?.id && !canOverride) {
        throw new Error("Selecione sua identidade interna para enviar mídia.");
      }

      // Detecta tipo
      const mime = file.type || "";
      let mediaType: "image" | "video" | "document" = "document";
      if (mime.startsWith("image/")) mediaType = "image";
      else if (mime.startsWith("video/")) mediaType = "video";

      // Upload
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${conv.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
      const mediaUrl = pub.publicUrl;

      const previewText = mediaType === "image" ? "📷 Imagem" : mediaType === "video" ? "🎬 Vídeo" : `📎 ${file.name}`;

      const { data: inserted, error: insErr } = await supabase.from("messages").insert({
        tenant_id: lead.tenant_id,
        conversation_id: conv.id,
        lead_id: lead.id,
        direction: "outbound",
        body: previewText,
        media_url: mediaUrl,
        message_type: mediaType,
        sent_by: (await supabase.auth.getUser()).data.user?.id,
        status: "pending",
      }).select("id").maybeSingle();
      if (insErr) throw insErr;
      if (!inserted) throw new Error("Mídia idêntica registrada agora há pouco. Tente novamente em alguns segundos.");
      pendingMessageId = inserted.id;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

      const { data: resp, error: fnErr } = await supabase.functions.invoke("whatsapp-manage", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: "send-media",
          tenant_id: lead.tenant_id,
          phone: lead.phone,
          media_url: mediaUrl,
          media_type: mediaType,
          doc_name: mediaType === "document" ? file.name : undefined,
          message_id: inserted.id,
        },
      });
      if (fnErr || (resp as any)?.error) {
        const msg = (resp as any)?.error || fnErr?.message || "Falha ao enviar mídia";
        throw new Error(msg);
      }

      await supabase.from("conversations").update({
        last_message_preview: previewText,
        last_message_at: new Date().toISOString(),
      }).eq("id", conv.id);
    } catch (e: any) {
      if (pendingMessageId) {
        await supabase.from("messages").update({ status: "failed" }).eq("id", pendingMessageId);
      }
      toast({ title: "Erro ao enviar mídia", description: e.message, variant: "destructive" });
    } finally {
      setMediaBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function suggest() {
    setAiBusy(true);
    try {
      const conversationId = conv.id?.startsWith?.("virtual:") ? null : conv.id;
      if (!conversationId) {
        toast({ title: "IA indisponível", description: "Envie uma mensagem primeiro para criar o histórico desta conversa.", variant: "destructive" });
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Saia e entre novamente para usar a IA.");
      const { data, error } = await supabase.functions.invoke("suggest-reply", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { conversation_id: conversationId },
      });
      if (error) throw new Error((data as any)?.error ?? error.message ?? "Falha na IA");
      if ((data as any)?.suggested_reply) setDraft((data as any).suggested_reply);
      else toast({ title: (data as any)?.error ?? "IA não retornou sugestão", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Erro IA", description: e.message, variant: "destructive" });
    } finally { setAiBusy(false); }
  }


  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header do chat */}
      <header className="wa-header flex h-[60px] shrink-0 items-center gap-2 px-2 md:gap-3 md:px-4">
        <button onClick={onBack} className="wa-muted shrink-0 rounded-full p-1.5 md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <InitialsAvatar name={lead?.name ?? "?"} src={(lead as any)?.avatar_url} className="shrink-0 bg-[#dfe5e7] text-[#54656f]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-[#111b21]">{lead?.name ?? lead?.phone}</span>
            {(lead as any)?.metadata?.imported_from_history && (
              <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                📦 Lead antigo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 truncate text-[12px] text-[#667781]">
            <span className="truncate">{lead?.phone}</span>
            {(lead as any)?.metadata?.imported_from_history && (
              <span className="sm:hidden inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                📦 antigo
              </span>
            )}
            {lead && <span className="hidden sm:inline-flex"><StageBadge stage={lead.stage} /></span>}
          </div>
        </div>
        {lead && <span className="shrink-0"><TempBadge temperature={lead.temperature} /></span>}
        <div className="flex shrink-0 items-center gap-0.5 text-[#54656f] md:gap-1">
          <button onClick={() => setShowSearch((v) => !v)} className="hidden rounded-full p-2 hover:bg-black/5 md:inline-flex" aria-label="Buscar nesta conversa">
            <Search className="h-5 w-5" />
          </button>
          {onToggleInfo && (
            <button
              onClick={onToggleInfo}
              className={cn(
                "hidden rounded-full p-2 hover:bg-black/5 md:inline-flex",
                showInfo && "bg-black/5 text-[#00a884]"
              )}
              aria-label={showInfo ? "Esconder perfil" : "Mostrar perfil"}
              title={showInfo ? "Esconder perfil" : "Mostrar perfil"}
            >
              <PanelRight className="h-5 w-5" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full p-1.5 hover:bg-black/5 md:p-2" aria-label="Mais ações"><MoreVertical className="h-5 w-5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to={`/pipeline?lead=${lead?.id}`}><Kanban className="mr-2 h-4 w-4" /> Ver no Pipeline</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyPhone}><Copy className="mr-2 h-4 w-4" /> Copiar telefone</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><BellOff className="mr-2 h-4 w-4" /> Silenciar IA</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => silenceAi(30)}>Por 30 minutos</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => silenceAi(120)}>Por 2 horas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => silenceAi(60 * 24)}>Por 24 horas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => silenceAi(60 * 24 * 7)}>Por 7 dias</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={unsilenceAi}><Bell className="mr-2 h-4 w-4" /> Reativar IA</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={blockContact}>
                <Ban className="mr-2 h-4 w-4" /> Bloquear contato
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {lead && (
        <div className="flex items-center gap-3 border-b border-[#d1d7db] bg-[#f7f9fa] px-3 py-1.5 md:px-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#667781]">Fechamento</span>
          <div className="flex-1">
            <LeadProgressBar temperature={lead.temperature} stage={lead.stage} size="md" showPercent />
          </div>
        </div>
      )}



      {(lead as any)?.metadata?.imported_from_history && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
          <strong>📦 Lead antigo:</strong> esta conversa foi importada do histórico do WhatsApp (antes do anúncio/CRM). Cuidado ao abordar — o contato pode não lembrar do atendimento.
        </div>
      )}


      {/* Faixa de responsável / trava de atendimento */}
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs",
        isLocked ? "bg-amber-50 text-amber-900" : assignedMember ? "bg-[#e7f8ef] text-[#1d6f5c]" : "bg-[#f0f2f5] text-[#54656f]",
      )}>
        <div className="flex items-center gap-2">
          {assignedMember ? (
            <>
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: assignedMember.avatar_color ?? "#1E40AF" }}
              >
                {assignedMember.display_name?.[0]?.toUpperCase() ?? "?"}
              </span>
              <span>
                Atendido por <strong>{assignedMember.display_name}</strong>
                {isMine && " (você)"}
              </span>
            </>
          ) : (
            <span>Lead sem responsável.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isMine && canAssume && (
            <Button
              size="sm"
              variant={assignedId ? "outline" : "default"}
              className="h-7 rounded-full px-3 text-xs"
              disabled={assume.isPending}
              onClick={() => {
                if (!member) return;
                if (assignedId && !confirm("Assumir este atendimento? O vendedor atual perderá o acesso ao envio.")) return;
                assume.mutate({ leadId: lead.id, memberId: member.id });
              }}
            >
              {assignedId ? "Assumir atendimento" : "Assumir"}
            </Button>
          )}
          {isMine && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-3 text-xs"
              disabled={release.isPending}
              onClick={() => {
                if (!member) return;
                release.mutate({ leadId: lead.id, memberId: member.id });
              }}
            >
              Liberar
            </Button>
          )}
        </div>
      </div>


      {showSearch && (
        <div className="flex items-center gap-2 border-b bg-white px-3 py-2">
          <Search className="h-4 w-4 text-[#54656f]" />
          <input
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar nesta conversa…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#8696a0]"
          />
          <button onClick={() => { setSearchQ(""); setShowSearch(false); }} className="rounded-full p-1 hover:bg-black/5" aria-label="Fechar busca">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Área de mensagens */}
      <div ref={messagesScrollRef} className="wa-bg-chat min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-[8%]">
        {messages.length === 0 && (() => {
          const isImported =
            (lead as any)?.imported_from_sheet === true ||
            (lead as any)?.metadata?.imported_from_history === true ||
            (lead as any)?.metadata?.imported_from_sheet === true;
          return (
            <div className="mx-auto max-w-sm text-center">
              {isImported ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <p className="font-semibold">Lead importado — sem histórico de pré-atendimento</p>
                  <p className="mt-1 text-amber-800/90">
                    Este contato veio de uma planilha/importação. Não houve atendimento da IA
                    porque não é um lead novo do WhatsApp. Inicie a conversa quando quiser.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#667781]">
                  Nenhuma mensagem ainda. Aguardando o primeiro contato do cliente
                  ou envie você mesmo a primeira mensagem.
                </p>
              )}
            </div>
          );
        })()}
        <div className="space-y-1">
          {(searchQ.trim()
            ? messages.filter((m) => (m.body ?? "").toLowerCase().includes(searchQ.trim().toLowerCase()))
            : messages
          ).map((m, idx, arr) => {
            const isOut = m.direction === "outbound";
            const prev = arr[idx - 1];
            const grouped = prev && prev.direction === m.direction;
            const mediaUrl = (m as any).media_url as string | null;
            const mType = (m as any).message_type as string | null;
            const isAudio = mType === "audio" || mType === "ptt" || (!!mediaUrl && /\.(ogg|mp3|m4a|webm|wav|opus)(\?|$)/i.test(mediaUrl ?? ""));
            const isImage = mType === "image" || (!!mediaUrl && !isAudio && /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(mediaUrl ?? ""));
            const isVideo = mType === "video" || (!!mediaUrl && !isAudio && !isImage && /\.(mp4|mov|webm|3gp|mkv)(\?|$)/i.test(mediaUrl ?? ""));
            const isDocument = !!mediaUrl && !isAudio && !isImage && !isVideo;
            const hasMedia = isAudio || isImage || isVideo || isDocument;
            const fileName = mediaUrl ? decodeURIComponent(mediaUrl.split("/").pop() ?? "arquivo").replace(/^\d+_/, "") : "arquivo";
            const sim = (m as any).metadata?.simulation;
            const isSimulation = isOut && hasMedia && sim?.is_simulation === true;
            return (
              <div key={m.id} className={cn("group flex w-full", isOut ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
                <div className={cn(
                  "relative max-w-[80%] px-2.5 py-1.5 text-[14.2px] leading-[19px] md:max-w-[65%]",
                  isOut ? "wa-bubble-out" : "wa-bubble-in",
                )}>
                  {/* Menu de ações (apagar) */}
                  {m.status !== "deleted" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Ações da mensagem"
                          className={cn(
                            "absolute -top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#54656f] opacity-0 shadow-sm transition-opacity hover:bg-[#f5f6f6] group-hover:opacity-100 focus:opacity-100",
                            isOut ? "-left-2" : "-right-2",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isOut ? "start" : "end"} className="w-56">
                        <DropdownMenuItem
                          onClick={() => {
                            if (!confirm("Apagar esta mensagem apenas para você no CRM?")) return;
                            deleteMessage(m.id, false);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Apagar para mim
                        </DropdownMenuItem>
                        {isOut && (m as any).external_id && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-700"
                            onClick={() => {
                              if (!confirm("Apagar esta mensagem para todos (também no WhatsApp do lead)?")) return;
                              deleteMessage(m.id, true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Apagar para todos
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {isSimulation && m.status !== "deleted" && (
                    <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                      ✓ Simulação enviada
                      {sim?.kind && sim.kind !== "outro" && <span className="font-normal normal-case text-emerald-700/80">· {String(sim.kind).replace(/_/g, " ")}</span>}
                    </div>
                  )}
                  {m.status === "deleted" ? (
                    <p className="flex items-center gap-1 whitespace-pre-wrap break-words pr-14 italic text-[#667781]">
                      <Ban className="h-3.5 w-3.5" /> Essa mensagem foi apagada
                    </p>
                  ) : isAudio && mediaUrl ? (
                    <audio controls src={mediaUrl} className="mb-1 h-10 w-[240px] max-w-full" />
                  ) : isImage && mediaUrl ? (
                    <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
                      <img src={mediaUrl} alt="" className="mb-1 max-h-80 w-full max-w-[280px] rounded object-cover" />
                      {m.body && m.body !== "📷 Imagem" && <p className="whitespace-pre-wrap break-words pr-14">{m.body}</p>}
                    </a>
                  ) : isVideo && mediaUrl ? (
                    <>
                      <video controls src={mediaUrl} className="mb-1 max-h-80 w-full max-w-[280px] rounded" />
                      {m.body && m.body !== "🎬 Vídeo" && <p className="whitespace-pre-wrap break-words pr-14">{m.body}</p>}
                    </>
                  ) : isDocument && mediaUrl ? (
                    <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded bg-black/5 px-2 py-2 hover:bg-black/10">
                      <FileText className="h-6 w-6 shrink-0 text-[#54656f]" />
                      <span className="truncate text-sm text-[#111b21]">{fileName}</span>
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap break-words pr-14">{m.body}</p>
                  )}
                  <span className={cn("flex items-center gap-1 text-[11px] text-[#667781]", hasMedia ? "justify-end pt-0.5" : "absolute bottom-1 right-2")}>

                    {formatTime(m.created_at)}
                    {isOut && m.status !== "deleted" && (
                      <span title={m.status === "read" ? "Lida pelo lead" : m.status === "delivered" ? "Entregue" : "Enviada"}>
                        {m.status === "read"
                          ? <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                          : m.status === "delivered"
                          ? <CheckCheck className="h-3.5 w-3.5" />
                          : <Check className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="wa-composer shrink-0 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:px-3 md:py-2.5">
        {isLocked ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs text-amber-900">
            <span>
              🔒 Atendimento atribuído a <strong>{assignedMember?.display_name ?? "outro vendedor"}</strong>.
            </span>
            {member && (
              <Button
                size="sm"
                className="h-8 rounded-full px-4 text-xs"
                disabled={assume.isPending}
                onClick={() => {
                  if (!confirm(`Assumir o atendimento de ${assignedMember?.display_name ?? "outro vendedor"}? Você passará a ser o responsável por este lead.`)) return;
                  assume.mutate({ leadId: lead.id, memberId: member.id });
                }}
              >
                Assumir atendimento
              </Button>
            )}
          </div>
        ) : isRecording ? (
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => stopRecording(true)}
              title="Cancelar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="flex-1 text-sm font-medium text-[#54656f]">
              Gravando {Math.floor(recElapsed / 60).toString().padStart(2, "0")}:{(recElapsed % 60).toString().padStart(2, "0")}
            </span>
            <Button
              size="icon"
              aria-label="Enviar áudio"
              onClick={() => stopRecording(false)}
              className="wa-send h-10 w-10 shrink-0 rounded-full p-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 md:gap-2">
            <QuickMessagesButton
              leadName={lead?.name ?? ""}
              onPick={(text) => setDraft((d) => (d ? d + "\n" + text : text))}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAndSendMedia(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={mediaBusy || (!member && !isSuperadmin)}
              title="Anexar imagem, vídeo ou documento"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition-colors hover:bg-[#f5f6f6] disabled:opacity-60"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={suggest}
              disabled={aiBusy}
              title="Sugerir resposta com IA"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-medium text-[#54656f] shadow-sm transition-colors hover:bg-[#f5f6f6] disabled:opacity-60 md:px-3"
            >
              <Sparkles className="h-4 w-4 text-[#00a884]" />
              <span className="hidden sm:inline">{aiBusy ? "Pensando…" : "IA"}</span>
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (send.isPending || sendingRef.current) return;
                  handleSend();
                  return;
                }
                if (e.key === " ") {
                  const expanded = tryExpandShortcut(draft);
                  if (expanded !== null) { e.preventDefault(); setDraft(expanded + " "); }
                }
              }}
              placeholder={(!member && !isSuperadmin) ? "Selecione sua identidade interna para enviar" : "Digite uma mensagem"}
              rows={1}
              disabled={!member && !isSuperadmin}
              className="wa-input flex max-h-32 min-h-[42px] min-w-0 flex-1 resize-none px-3 py-2 text-[15px] placeholder:text-[#667781] focus:outline-none disabled:opacity-60 md:px-4"
            />
            {draft.trim() ? (
              <Button
                size="icon"
                aria-label="Enviar"
                onClick={handleSend}
                disabled={send.isPending || (!member && !isSuperadmin)}
                className="wa-send h-10 w-10 shrink-0 rounded-full p-0 disabled:opacity-60"

              >
                <Send className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label="Gravar áudio"
                onClick={startRecording}
                disabled={audioBusy || (!member && !isSuperadmin)}

                title="Gravar mensagem de voz"
                className="wa-send h-10 w-10 shrink-0 rounded-full p-0 disabled:opacity-60"
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}
      </div>


    </div>
  );
}

function QuickMessagesButton({ leadName, onPick }: { leadName: string; onPick: (text: string) => void }) {
  const { data: templates = [], isLoading } = useTemplates();
  const firstName = (leadName || "").trim().split(/\s+/)[0] || "";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Mensagens prontas"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-medium text-[#54656f] shadow-sm transition-colors hover:bg-[#f5f6f6] md:px-3"
        >
          <Zap className="h-4 w-4 text-[#f59e0b]" />
          <span className="hidden sm:inline">Prontas</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Mensagens prontas</span>
          <RLink to="/mensagens-prontas" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Gerenciar
          </RLink>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {isLoading && <p className="p-3 text-xs text-muted-foreground">Carregando…</p>}
          {!isLoading && templates.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma mensagem pronta. Crie em "Gerenciar".</p>
          )}
          {(() => { let n = 0; return templates.map((t) => {
            const rendered = renderTemplate(t.body ?? t.content ?? "", { nome: firstName });
            const shortcut = t.is_global ? null : `/${++n}`;
            return (
              <button
                key={t.id}
                onClick={() => onPick(rendered)}
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  {shortcut && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">{shortcut}</span>}
                  <span className="truncate text-sm font-medium">{t.title ?? t.name}</span>
                  {t.is_global && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">padrão</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{rendered}</p>
              </button>
            );
          }); })()}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LeadInfoPanel({ conv, onClose }: { conv: any; onClose: () => void }) {
  const lead = conv?.lead as Tables<"leads"> | null;
  const { data: members = [] } = useTenantMembers();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  const assignedId = (lead as any)?.assigned_member_id as string | null;
  const assignedMember = assignedId ? members.find((m) => m.id === assignedId) : null;
  const createdAt = (lead as any)?.created_at as string | null;
  const lastInteraction = conv?.last_message_at as string | null;
  const source = (lead as any)?.source as string | null;
  const email = (lead as any)?.email as string | null;
  const notes = (lead as any)?.notes as string | null;
  const tags = ((lead as any)?.tags ?? []) as string[];

  async function saveEdit() {
    if (!lead) return;
    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .update({
        name: editForm.name || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
      })
      .eq("id", lead.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lead atualizado" });
    setIsEditing(false);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  if (!lead) return null;

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-l border-[#e9edef] bg-white lg:flex">
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#e9edef] px-4">
        <span className="text-[15px] font-semibold text-[#111b21]">Perfil do contato</span>
        <button
          onClick={onClose}
          aria-label="Fechar perfil"
          className="rounded-full p-1.5 text-[#54656f] hover:bg-black/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* Avatar + nome */}
        <div className="flex flex-col items-center text-center">
          <InitialsAvatar
            name={lead.name ?? "?"}
            src={(lead as any)?.avatar_url}
            className="h-20 w-20 bg-[#dfe5e7] text-2xl text-[#54656f]"
          />
          <h3 className="mt-3 text-[17px] font-semibold text-[#111b21]">
            {lead.name ?? lead.phone ?? "Sem nome"}
          </h3>
          {lead.phone && (
            <p className="mt-0.5 text-[13px] text-[#667781]">{lead.phone}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <TempBadge temperature={lead.temperature} />
            <StageBadge stage={lead.stage} />
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            to={`/pipeline?lead=${lead.id}`}
            className="flex flex-col items-center gap-1 rounded-lg border border-[#e9edef] px-2 py-2.5 text-[11px] font-medium text-[#54656f] hover:bg-[#f5f6f6] hover:text-[#111b21]"
          >
            <Kanban className="h-4 w-4 text-[#00a884]" />
            Pipeline
          </Link>
          <button
            onClick={() => {
              if (!lead.phone) return;
              navigator.clipboard.writeText(lead.phone);
              toast({ title: "Telefone copiado" });
            }}
            className="flex flex-col items-center gap-1 rounded-lg border border-[#e9edef] px-2 py-2.5 text-[11px] font-medium text-[#54656f] hover:bg-[#f5f6f6] hover:text-[#111b21]"
          >
            <Copy className="h-4 w-4 text-[#00a884]" />
            Copiar
          </button>
          <button
            onClick={() => {
              setEditForm({
                name: lead.name ?? "",
                phone: lead.phone ?? "",
                email: lead.email ?? "",
              });
              setIsEditing(true);
            }}
            className="flex flex-col items-center gap-1 rounded-lg border border-[#e9edef] px-2 py-2.5 text-[11px] font-medium text-[#54656f] hover:bg-[#f5f6f6] hover:text-[#111b21]"
          >
            <Pencil className="h-4 w-4 text-[#00a884]" />
            Editar
          </button>
        </div>

        {/* Edição inline */}
        {isEditing && (
          <div className="space-y-3 rounded-xl border border-[#e9edef] bg-[#f5f6f6] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#111b21]">Editar contato</span>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-full p-1 text-[#54656f] hover:bg-black/5"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[#667781]">Nome</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-[#e9edef] bg-white px-3 py-2 text-[13px] text-[#111b21] outline-none focus:border-[#00a884]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[#667781]">Telefone</label>
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-[#e9edef] bg-white px-3 py-2 text-[13px] text-[#111b21] outline-none focus:border-[#00a884]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[#667781]">E-mail</label>
              <input
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-[#e9edef] bg-white px-3 py-2 text-[13px] text-[#111b21] outline-none focus:border-[#00a884]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-lg border border-[#e9edef] bg-white py-2 text-[13px] font-medium text-[#54656f] hover:bg-[#f5f6f6]"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 rounded-lg bg-[#00a884] py-2 text-[13px] font-medium text-white hover:bg-[#008f72] disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {/* Responsável */}
        <Section title="Responsável">
          {assignedMember ? (
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: assignedMember.avatar_color ?? "#1E40AF" }}
              >
                {assignedMember.display_name?.[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-[#111b21]">{assignedMember.display_name}</p>
                <p className="truncate text-[11.5px] text-[#667781]">
                  {assignedMember.role_label ?? "Consultor"}
                  {assignedMember.username ? ` · @${assignedMember.username}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-[#667781]">Sem responsável atribuído.</p>
          )}
        </Section>

        {/* Informações */}
        <Section title="Informações">
          <InfoRow icon={Phone} label="Telefone" value={lead.phone ?? "—"} />
          {email && <InfoRow icon={Mail} label="E-mail" value={email} />}
          {source && <InfoRow icon={Tag} label="Origem" value={source} />}
          {createdAt && (
            <InfoRow icon={Calendar} label="Criado em" value={new Date(createdAt).toLocaleDateString("pt-BR")} />
          )}
          {lastInteraction && (
            <InfoRow icon={Clock} label="Última mensagem" value={timeAgo(lastInteraction)} />
          )}
        </Section>

        {/* Tags */}
        {tags.length > 0 && (
          <Section title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full bg-[#e7f8ef] px-2 py-0.5 text-[11px] font-medium text-[#1d6f5c]">
                  {t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Notas */}
        {notes && (
          <Section title="Notas">
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#3b4a54]">{notes}</p>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#8696a0]" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-[#8696a0]">{label}</p>
        <p className="truncate text-[13px] text-[#111b21]">{value}</p>
      </div>
    </div>
  );
}
