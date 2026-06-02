import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLeads, useAssumeLead } from "@/hooks/useData";
import { useConversationConsultants } from "@/hooks/useConversationConsultants";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, MessageCircle, Search, Send, UserCheck, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCoachingByMember } from "@/hooks/useCoachingInsights";
import { OnlineStatusDot, isOnline, formatLastSeen } from "@/components/ui/OnlineStatusDot";
import { PresenceBadges } from "@/components/ui/PresenceBadges";
import { useWhatsAppOnline, isWhatsAppOnline } from "@/hooks/useWhatsAppOnline";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isConsultantLike(roleLabel?: string | null, username?: string | null) {
  const v = normalize(`${roleLabel ?? ""} ${username ?? ""}`);
  if (/(dono|owner|proprietario|supervisor)/.test(v)) return false;
  return true; // consultor, vendedor, atendente, menor aprendiz, etc.
}

export default function ConsultoresPage() {
  const { can } = usePermissions();
  const { data: members = [], isLoading: loadingMembers } = useConversationConsultants();
  const { data: waOnline } = useWhatsAppOnline();
  const { data: leads = [], isLoading: loadingLeads } = useLeads();
  const { data: coachingByMember = {} } = useCoachingByMember(30);
  const { member: activeMember } = useActiveMember();
  const assume = useAssumeLead();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");

  const canViewTeam = can("view_team_metrics");
  const canAssume = can("assume_any_lead");

  const consultants = useMemo(
    () => members.filter((m) => m.role === "tenant" || isConsultantLike(m.role_label, m.username)),
    [members],
  );

  const onlineCount = useMemo(
    () => consultants.filter((m) => isOnline(m.last_seen_at)).length,
    [consultants],
  );
  const waOnlineCount = useMemo(
    () => consultants.filter((m) => isWhatsAppOnline(waOnline, m.id)).length,
    [consultants, waOnline],
  );
  const offlineCount = consultants.length - onlineCount;

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const base = statusFilter === "all"
      ? consultants
      : consultants.filter((m) => (statusFilter === "online" ? isOnline(m.last_seen_at) : !isOnline(m.last_seen_at)));
    if (!q) return base;
    return base.filter((m) =>
      normalize(`${m.display_name} ${m.full_name ?? ""} ${m.username ?? ""} ${m.role_label ?? ""}`).includes(q),
    );
  }, [consultants, search, statusFilter]);

  if (!canViewTeam) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área.
        </p>
      </div>
    );
  }

  async function handleAssume(leadId: string) {
    if (!activeMember?.id) {
      toast.error("Identifique-se como membro interno para assumir o atendimento.");
      return;
    }
    try {
      await assume.mutateAsync({ leadId, memberId: activeMember.id });
      toast.success("Atendimento assumido com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao assumir.");
    }
  }

  async function handleSendTo(leadId: string, memberId: string, memberName: string) {
    try {
      await assume.mutateAsync({ leadId, memberId });
      toast.success(`Lead enviado para ${memberName}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar lead.");
    }
  }

  return (
    <>
      <PageHeader
        title="Consultores"
        subtitle={`${consultants.length} no total · ${onlineCount} no sistema · ${waOnlineCount} no WhatsApp · ${offlineCount} offline`}
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar consultor por nome, @usuário ou cargo..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 rounded-full border bg-muted/30 p-1">
            {([
              { key: "all", label: `Todos (${consultants.length})` },
              { key: "online", label: `Online (${onlineCount})` },
              { key: "offline", label: `Offline (${offlineCount})` },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === opt.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>


        {loadingMembers || loadingLeads ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum consultor encontrado.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => {
              const tenantId = m.id.startsWith("tenant:") ? m.id.slice("tenant:".length) : null;
              const myLeads = leads.filter((l) => tenantId ? l.tenant_id === tenantId : (l.assigned_member_id === m.id || l.assigned_to === m.id));
              const active = myLeads.filter((l) => {
                if (!l.last_interaction_at) return false;
                const diff = Date.now() - new Date(l.last_interaction_at).getTime();
                return diff < 1000 * 60 * 60 * 24; // 24h
              });
              const isOpen = expanded === m.id;
              return (
                <div key={m.id} className="overflow-hidden rounded-2xl border bg-card">
                  <button
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="relative">
                      <UserAvatar
                        userId={m.id}
                        name={m.display_name}
                        avatarUrl={m.avatar_url}
                        avatarColor={m.avatar_color}
                        size={40}
                      />
                      <OnlineStatusDot
                        lastSeenAt={m.last_seen_at}
                        className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5 ring-2 ring-card"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{m.display_name}</p>
                        {m.role_label && (
                          <Badge variant="secondary" className="text-[10px]">{m.role_label}</Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                          {m.username ? `@${m.username}` : m.role_label ?? "Consultor"} · {formatLastSeen(m.last_seen_at)}
                      </p>
                      <PresenceBadges
                        className="mt-1"
                        lastSeenAt={m.last_seen_at}
                        whatsappOnline={isWhatsAppOnline(waOnline, m.id)}
                      />
                    </div>
                    <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{myLeads.length}</p>
                        <p>em atendimento</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{active.length}</p>
                        <p>ativos hoje</p>
                      </div>
                      {(() => {
                        const agg = coachingByMember[m.id];
                        if (!agg || agg.total === 0) return null;
                        const tone = agg.high > 0
                          ? "border-red-200 bg-red-50 text-red-700"
                          : agg.total > 3
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-border bg-muted/40 text-muted-foreground";
                        return (
                          <Link
                            to="/coaching"
                            onClick={(e) => e.stopPropagation()}
                            title={`${agg.total} alerta${agg.total === 1 ? "" : "s"} de coaching · ${agg.missed_signal} sinal perdido · ${agg.should_be_audio} devia ser áudio`}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors hover:opacity-80 ${tone}`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {agg.total} IA
                          </Link>
                        );
                      })()}
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/20 p-3">
                      {myLeads.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Nenhum atendimento em andamento.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {myLeads.map((lead) => (
                            <li
                              key={lead.id}
                              className="flex items-center gap-3 rounded-xl bg-background p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {lead.name ?? "Sem nome"}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {lead.phone ?? lead.email ?? "—"}
                                  {lead.stage && <span className="ml-2">· {lead.stage}</span>}
                                </p>
                              </div>
                              <Link to={tenantId ? `/conversas?consultor=${encodeURIComponent(m.id)}` : `/conversas?consultor=${m.id}`}>
                                <Button size="sm" variant="ghost">
                                  <MessageCircle className="mr-1 h-4 w-4" /> Ver
                                </Button>
                              </Link>
                              {canAssume && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAssume(lead.id)}
                                  disabled={assume.isPending}
                                  className={cn(activeMember?.id === lead.assigned_member_id && "hidden")}
                                >
                                  <UserCheck className="mr-1 h-4 w-4" /> Assumir
                                </Button>
                              )}
                              {canAssume && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline" disabled={assume.isPending}>
                                      <Send className="mr-1 h-4 w-4" /> Enviar
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                                    <DropdownMenuLabel>Enviar lead para</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {consultants
                                      .filter((c) => c.id !== lead.assigned_member_id)
                                      .map((c) => (
                                        <DropdownMenuItem
                                          key={c.id}
                                          onClick={() => handleSendTo(lead.id, c.id, c.display_name)}
                                        >
                                          <UserAvatar
                                            userId={c.id}
                                            name={c.display_name}
                                            avatarUrl={c.avatar_url}
                                            avatarColor={c.avatar_color}
                                            size={24}
                                          />
                                          <span className="ml-2 truncate">{c.display_name}</span>
                                          {c.role_label && (
                                            <span className="ml-auto text-[10px] text-muted-foreground">
                                              {c.role_label}
                                            </span>
                                          )}
                                        </DropdownMenuItem>
                                      ))}
                                    {consultants.filter((c) => c.id !== lead.assigned_member_id).length === 0 && (
                                      <DropdownMenuItem disabled>Nenhum outro consultor</DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
