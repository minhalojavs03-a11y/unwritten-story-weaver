import { useMemo, useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { useAllTeams, type TenantTeamSummary } from "@/hooks/useAllTeams";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { OnlineStatusDot } from "@/components/ui/OnlineStatusDot";
import { RoleBadge, type AppRole } from "@/components/ui/RoleBadge";
import { Input } from "@/components/ui/input";
import { Building2, ChevronDown, ChevronRight, Mail, Search, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AdminEquipes() {
  const { data: teams = [], isLoading } = useAllTeams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.tenant.name.toLowerCase().includes(q) ||
        t.members.some((m) =>
          [m.display_name, m.full_name, m.email].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
        ),
    );
  }, [teams, search]);

  const totals = useMemo(() => {
    return {
      tenants: teams.length,
      members: teams.reduce((a, t) => a + t.member_count, 0),
      pending: teams.reduce((a, t) => a + t.pending_invites, 0),
    };
  }, [teams]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <AdminHeader title="Equipes" subtitle="Visão consolidada de todas as unidades Feracon" />
      <div className="space-y-4 p-4 md:p-8">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <SummaryTile icon={Building2} label="Unidades" value={totals.tenants} />
          <SummaryTile icon={Users} label="Membros totais" value={totals.members} />
          <SummaryTile icon={Mail} label="Convites pendentes" value={totals.pending} />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por unidade, nome ou e-mail..."
              className="pl-9"
            />
          </div>
          <Link to="/admin/auth">
            <Button variant="outline" className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4 text-primary" />
              Gestão de Acessos Manual
            </Button>
          </Link>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma unidade encontrada.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((t) => (
            <TenantRow
              key={t.tenant.id}
              team={t}
              expanded={expanded.has(t.tenant.id)}
              onToggle={() => toggle(t.tenant.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function TenantRow({ team, expanded, onToggle }: { team: TenantTeamSummary; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40">
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-semibold text-foreground">
            <span className="truncate">{team.tenant.name}</span>
            {team.members.some((m) => m.roles.includes("superadmin")) && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Superadmin
              </span>
            )}
            {team.owner_profile && (team.owner_profile.display_name || team.owner_profile.full_name) &&
              (team.owner_profile.display_name || team.owner_profile.full_name) !== team.tenant.name && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  · {team.owner_profile.display_name || team.owner_profile.full_name}
                </span>
              )}
          </p>
          <p className="text-xs text-muted-foreground">Plano {team.tenant.plan}</p>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <Chip label="Donos" value={team.owners} />
          <Chip label="Supervisores" value={team.supervisors} />
          <Chip label="Consultores" value={team.consultants} />
          <Chip label="Atendentes" value={team.attendants} />
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
          {team.member_count}
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
        {team.pending_invites > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <UserPlus className="h-3 w-3" /> {team.pending_invites}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 p-3">
          {team.members.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhum membro cadastrado nesta unidade.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {team.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
                  <div className="relative">
                    <UserAvatar
                      userId={m.id}
                      name={m.display_name || m.full_name || m.email || "?"}
                      avatarUrl={m.avatar_url}
                      avatarColor={m.avatar_color}
                      size={40}
                    />
                    <OnlineStatusDot lastSeenAt={m.last_seen_at} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.display_name || m.full_name || "Sem nome"}
                      </p>
                      <RoleBadge role={m.primary_role as AppRole} customLabel={m.role_label} size="sm" />
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5", value > 0 ? "bg-muted text-foreground" : "text-muted-foreground/50")}>
      {value} {label}
    </span>
  );
}
