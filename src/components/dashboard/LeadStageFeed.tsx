import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { timeAgo } from "@/lib/format";
import { useLeadStageEvents } from "@/hooks/useLeadStageEvents";
import { useTenantMembers } from "@/hooks/useData";

const PAGE_SIZE = 5;
const ALL = "__all__";

interface Props {
  tenantId?: string | null;
  /** Gestores veem o time todo; consultores recebem o próprio memberId aqui. */
  memberId?: string | null;
  privileged: boolean;
}

export function LeadStageFeed({ tenantId, memberId, privileged }: Props) {
  const [filterMember, setFilterMember] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const { data: members = [] } = useTenantMembers(tenantId ?? undefined);

  const scopedMemberId = privileged ? (filterMember === ALL ? null : filterMember) : memberId ?? null;
  const blocked = !privileged && !scopedMemberId;
  const { events: allEvents, loading } = useLeadStageEvents({ tenantId, memberId: scopedMemberId, limit: 60 });
  const events = blocked ? [] : allEvents;

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () => events.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [events, safePage],
  );

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Atualizações de etapas dos leads</h2>
            <p className="text-[11px] text-muted-foreground">
              {privileged ? "Time todo · em tempo real" : "Suas atualizações · em tempo real"}
            </p>
          </div>
        </div>

        {privileged && (
          <Select
            value={filterMember}
            onValueChange={(v) => {
              setFilterMember(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-full min-w-[180px] text-xs sm:w-auto">
              <SelectValue placeholder="Todos os consultores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os consultores</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Carregando atualizações…</p>
      ) : pageItems.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma atualização registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {pageItems.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/60 p-3"
            >
              <InitialsAvatar name={ev.member_name ?? "?"} className="h-8 w-8 text-[11px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {ev.lead_id ? (
                    <Link to={`/leads?lead=${ev.lead_id}`} className="hover:underline">
                      {ev.lead_name ?? "Lead"}
                    </Link>
                  ) : (
                    ev.lead_name ?? "Lead"
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">{ev.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                  {ev.member_name ?? "Sem consultor"} · {timeAgo(ev.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {events.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Página {safePage + 1} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
