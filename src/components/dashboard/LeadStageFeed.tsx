import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/oticaflow/Avatar";
import { timeAgo } from "@/lib/format";
import { useLeadStageEvents } from "@/hooks/useLeadStageEvents";
import { useTenantMembers } from "@/hooks/useData";
import { useIsMobile } from "@/hooks/use-mobile";

const PAGE_SIZE_DESKTOP = 10;
const PAGE_SIZE_MOBILE = 5;
const ALL = "__all__";

type Tone = {
  card: string;
  chip: string;
  bar: string;
};

const TONES: Record<string, Tone> = {
  venda: {
    card: "border-success/40 bg-success/5",
    chip: "bg-success/15 text-success border-success/30",
    bar: "bg-success",
  },
  reuniao: {
    card: "border-stage-attended/40 bg-stage-attended/5",
    chip: "bg-stage-attended/15 text-stage-attended border-stage-attended/30",
    bar: "bg-stage-attended",
  },
  agendado: {
    card: "border-info/40 bg-info/5",
    chip: "bg-info/15 text-info border-info/30",
    bar: "bg-info",
  },
  simulacao: {
    card: "border-warning/40 bg-warning/5",
    chip: "bg-warning/15 text-warning border-warning/30",
    bar: "bg-warning",
  },
  negativo: {
    card: "border-destructive/40 bg-destructive/5",
    chip: "bg-destructive/15 text-destructive border-destructive/30",
    bar: "bg-destructive",
  },
  neutro: {
    card: "border-border/60 bg-muted/30",
    chip: "bg-muted text-muted-foreground border-border",
    bar: "bg-muted-foreground/50",
  },
};

function toneFor(label: string, stage?: string | null): Tone {
  const t = `${label} ${stage ?? ""}`.toLowerCase();
  if (t.includes("fechou") || t.includes("comprou") || t.includes("vendid") || t.includes("venda")) return TONES.venda;
  if (t.includes("não compareceu") || t.includes("nao compareceu") || t.includes("perdid") || t.includes("não reagendou") || t.includes("nao reagendou"))
    return TONES.negativo;
  if (t.includes("compareceu")) return TONES.reuniao;
  if (t.includes("reunião") || t.includes("reuniao") || t.includes("reagend") || t.includes("agendad")) return TONES.agendado;
  if (t.includes("simula") || t.includes("ligação") || t.includes("ligacao") || t.includes("qualific")) return TONES.simulacao;
  return TONES.neutro;
}


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
  const isMobile = useIsMobile();
  const pageSize = isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;

  useEffect(() => {
    setPage(0);
  }, [isMobile, filterMember]);

  const scopedMemberId = privileged ? (filterMember === ALL ? null : filterMember) : memberId ?? null;
  const blocked = !privileged && !scopedMemberId;
  const { events: allEvents, loading } = useLeadStageEvents({ tenantId, memberId: scopedMemberId, limit: 60 });
  const events = blocked ? [] : allEvents;

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () => events.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [events, safePage, pageSize],
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
        <ul className="space-y-2.5">
          {pageItems.map((ev) => {
            const tone = toneFor(ev.label, ev.stage);
            return (
              <li
                key={ev.id}
                className={`relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 pl-4 shadow-sm transition-colors ${tone.card}`}
              >
                <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`} aria-hidden />
                <InitialsAvatar name={ev.member_name ?? "?"} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1 text-sm font-bold leading-tight ${tone.chip}`}
                  >
                    <span className="truncate">{ev.label}</span>
                  </span>
                  <p className="mt-1.5 truncate text-sm font-semibold">
                    {ev.lead_id ? (
                      <Link to={`/leads?lead=${ev.lead_id}`} className="hover:underline">
                        {ev.lead_name ?? "Lead"}
                      </Link>
                    ) : (
                      ev.lead_name ?? "Lead"
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {ev.member_name ?? "Sem consultor"} · {timeAgo(ev.created_at)}
                  </p>
                </div>
              </li>
            );
          })}

        </ul>
      )}

      {events.length > pageSize && (
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
