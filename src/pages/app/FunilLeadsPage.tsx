import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { Skeleton } from "@/components/ui/skeleton";
import { stageLabels, stageOrder } from "@/data/mock";
import { cn } from "@/lib/utils";
import { useCanViewLeadPhone, displayPhone } from "@/lib/leadPrivacy";
import { StageBadge } from "@/components/oticaflow/StageBadge";

type Metric =
  | "leads"
  | "simulacoes"
  | "reunioes"
  | "fechados"
  | "perdidos"
  | "sem_simulacoes"
  | "sem_reunioes"
  | "sem_fechados";

const METRICS: Record<Metric, { label: string; subtitle: string; stages: string[] | null; exclude?: string[] }> = {
  leads: { label: "Leads / Clientes", subtitle: "Todos os leads do período", stages: null },
  simulacoes: {
    label: "Simulações encaminhadas",
    subtitle: "Leads que avançaram para simulação ou além",
    stages: ["agendado", "compareceu", "comprou"],
  },
  reunioes: {
    label: "Reuniões agendadas",
    subtitle: "Leads que chegaram à reunião ou fecharam",
    stages: ["compareceu", "comprou"],
  },
  fechados: { label: "Clientes fechados", subtitle: "Leads com cota vendida", stages: ["comprou"] },
  perdidos: { label: "Leads perdidos", subtitle: "Leads desqualificados", stages: ["perdido"] },
  sem_simulacoes: {
    label: "Sem simulação enviada",
    subtitle: "Leads ativos que ainda não receberam simulação (não inclui perdidos)",
    stages: null,
    exclude: ["agendado", "compareceu", "comprou", "perdido"],
  },
  sem_reunioes: {
    label: "Sem reunião agendada",
    subtitle: "Leads ativos que ainda não chegaram à reunião (não inclui perdidos)",
    stages: null,
    exclude: ["compareceu", "comprou", "perdido"],
  },
  sem_fechados: {
    label: "Não fechados",
    subtitle: "Leads ativos que ainda não fecharam cota (não inclui perdidos)",
    stages: null,
    exclude: ["comprou", "perdido"],
  },
};


type Row = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  source: string | null;
  credit_value: number | null;
  created_at: string;
  updated_at: string | null;
  assigned_member_id: string | null;
  assigned_to: string | null;
};

const fmtBRL = (n: number | null | undefined) =>
  n && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

function monthStartISO() {
  const now = new Date();
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3, 0, 0)).toISOString();
}

export default function FunilLeadsPage() {
  const [params, setParams] = useSearchParams();
  const metric = (params.get("metric") as Metric) || "leads";
  const scope = params.get("scope") === "all" ? "all" : "month";
  const stageFilter = params.get("stage") || "todas";
  const consultantFilter = params.get("consultor") || "todos";
  const cfg = METRICS[metric] ?? METRICS.leads;
  const canViewPhoneFn = useCanViewLeadPhone();

  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<{ id: string; user_id: string | null; display_name: string }[]>([]);
  const [computedGap, setComputedGap] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // PostgREST devolve no máximo 1000 linhas por requisição — paginamos
      // até trazer todos os leads do recorte.
      const PAGE = 1000;
      const all: Row[] = [];
      for (let page = 0; page < 20; page++) {
        let q = supabase
          .from("leads")
          .select("id, name, phone, email, stage, source, credit_value, created_at, updated_at, assigned_member_id, assigned_to")
          .eq("tenant_id", FERACON_TENANT_ID)
          .eq("kind", "lead")
          .order("updated_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);

        if (cfg.stages) q = q.in("stage", cfg.stages);
        if (cfg.exclude) q = q.or(`stage.is.null,stage.not.in.(${cfg.exclude.join(",")})`);

        if (scope === "month") q = q.gte("updated_at", monthStartISO());

        const { data } = await q;
        if (cancelled) return;
        const batch = (data ?? []) as Row[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }

      const membersRes = await supabase
        .from("tenant_members")
        .select("id, user_id, display_name")
        .eq("tenant_id", FERACON_TENANT_ID);
      if (cancelled) return;

      // Defasagem exata igual ao Funil de Meta: ideal (% da meta sobre o total
      // de leads do recorte) menos o realizado da etapa.
      const GOAL_PCT: Record<string, number> = { sem_simulacoes: 70, sem_reunioes: 30, sem_fechados: 4 };
      const REALIZED: Record<string, string[]> = {
        sem_simulacoes: ["agendado", "compareceu", "comprou"],
        sem_reunioes: ["compareceu", "comprou"],
        sem_fechados: ["comprou"],
      };
      if (GOAL_PCT[metric]) {
        const base = () => {
          let q = supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", FERACON_TENANT_ID)
            .eq("kind", "lead");
          if (scope === "month") q = q.gte("updated_at", monthStartISO());
          return q;
        };
        const [totalRes, realRes] = await Promise.all([
          base(),
          base().in("stage", REALIZED[metric]),
        ]);
        if (cancelled) return;
        const totalLeads = totalRes.count ?? 0;
        const realized = realRes.count ?? 0;
        const ideal = Math.round((totalLeads * GOAL_PCT[metric]) / 100);
        setComputedGap(Math.max(0, ideal - realized));
      } else {
        setComputedGap(null);
      }

      setRows(all);
      setMembers((membersRes.data ?? []) as any[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [metric, scope]);


  const nameOf = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.display_name]));
    const byUser = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.display_name]));
    return (r: Row) =>
      (r.assigned_member_id && byId.get(r.assigned_member_id)) ||
      (r.assigned_to && byUser.get(r.assigned_to)) ||
      "Sem consultor";
  }, [members]);

  // A lista de defasagem precisa bater exatamente com o número do Funil de Meta
  // (ex.: -280 → 280 leads). Usamos o valor calculado na página; o ?gap da URL
  // serve apenas como fallback enquanto os contadores carregam.
  const gapLimit = useMemo(() => {
    if (computedGap !== null) return computedGap > 0 ? computedGap : null;
    const raw = params.get("gap");
    if (!raw) return null;
    const n = Math.abs(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params, computedGap]);

  const scopedAll = useMemo(() => (gapLimit ? rows.slice(0, gapLimit) : rows), [rows, gapLimit]);

  const consultantOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of scopedAll) {
      const n = nameOf(r);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedAll, nameOf]);

  const scopedRows = useMemo(
    () => (consultantFilter === "todos" ? scopedAll : scopedAll.filter((r) => nameOf(r) === consultantFilter)),
    [scopedAll, consultantFilter, nameOf],
  );

  const visibleRows = useMemo(
    () => (stageFilter === "todas" ? scopedRows : scopedRows.filter((r) => (r.stage ?? "novo") === stageFilter)),
    [scopedRows, stageFilter],
  );
  const total = visibleRows.length;

  const linkTo = (over: Record<string, string>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(over)) q.set(k, v);
    return `/funil/leads?${q.toString()}`;
  };

  const selectCls =
    "w-full rounded-xl border-2 border-primary/40 bg-card px-3 py-2.5 text-sm font-semibold text-foreground shadow-sm focus:border-primary focus:outline-none";
  const labelCls = "text-[11px] font-bold uppercase tracking-wide text-primary";

  return (
    <>
      <PageHeader
        title={`${cfg.label}: ${loading ? "…" : total}`}
        subtitle={`${cfg.subtitle} · ${scope === "month" ? "Mês atual" : "Histórico completo"}${
          gapLimit ? ` · Defasagem exata da meta: ${gapLimit} leads` : ""
        }`}
        actions={
          <Link to="/crm" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Início
          </Link>
        }
      />


      <div className="w-full max-w-full space-y-4 overflow-x-hidden p-3 md:p-8">
        {/* ===== Mobile: filtros compactos em selects ===== */}
        <div className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-primary/30 bg-muted/40 p-3 md:hidden">
          <label className="space-y-1">
            <span className={labelCls}>Métrica</span>
            <select className={selectCls} value={metric} onChange={(e) => setParam("metric", e.target.value)}>
              {(Object.keys(METRICS) as Metric[]).map((k) => (
                <option key={k} value={k}>{METRICS[k].label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={labelCls}>Período</span>
              <select className={selectCls} value={scope} onChange={(e) => setParam("scope", e.target.value)}>
                <option value="month">Mês atual</option>
                <option value="all">Tudo</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelCls}>Etapa</span>
              <select className={selectCls} value={stageFilter} onChange={(e) => setParam("stage", e.target.value)}>
                <option value="todas">Todas ({scopedRows.length})</option>
                {stageOrder.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]} ({scopedRows.filter((r) => (r.stage ?? "novo") === s).length})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1">
            <span className={labelCls}>Consultor</span>
            <select className={selectCls} value={consultantFilter} onChange={(e) => setParam("consultor", e.target.value)}>
              <option value="todos">Todos os consultores ({scopedAll.length})</option>
              {consultantOptions.map(([name, count]) => (
                <option key={name} value={name}>{name} ({count})</option>
              ))}
            </select>
          </label>
        </div>


        {/* ===== Desktop: chips ===== */}
        <div className="hidden flex-wrap gap-2 md:flex">
          {(Object.keys(METRICS) as Metric[]).map((k) => (
            <Link
              key={k}
              to={linkTo({ metric: k })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                k === metric
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border-2 border-primary/30 bg-card text-foreground hover:border-primary hover:bg-muted",
              )}
            >
              {METRICS[k].label}
            </Link>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(["month", "all"] as const).map((s) => (
            <Link
              key={s}
              to={linkTo({ scope: s })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                s === scope
                  ? "bg-foreground text-background shadow-sm"
                  : "border-2 border-primary/30 bg-card text-foreground hover:border-primary hover:bg-muted",
              )}
            >
              {s === "month" ? "Mês atual" : "Tudo"}
            </Link>
          ))}
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">Consultor</span>
          <select
            className="rounded-lg border-2 border-primary/40 bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
            value={consultantFilter}
            onChange={(e) => setParam("consultor", e.target.value)}
          >
            <option value="todos">Todos os consultores ({scopedAll.length})</option>
            {consultantOptions.map(([name, count]) => (
              <option key={name} value={name}>{name} ({count})</option>
            ))}
          </select>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">Etapa</span>
          {(["todas", ...stageOrder] as const).map((s) => {
            const count = s === "todas" ? scopedRows.length : scopedRows.filter((r) => (r.stage ?? "novo") === s).length;
            return (
              <Link
                key={s}
                to={linkTo({ stage: s })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  s === stageFilter
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border-2 border-primary/30 bg-card text-foreground hover:border-primary hover:bg-muted",
                )}
              >
                {s === "todas" ? "Todas" : stageLabels[s]}
                <span className="ml-1 tabular-nums opacity-70">{loading ? "" : count}</span>
              </Link>
            );
          })}
        </div>




        <div className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-card shadow-sm">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : total === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lead encontrado neste recorte.</div>
          ) : (
            <>
            {/* Mobile: lista em cartões */}
            <ul className="divide-y md:hidden">
              {visibleRows.map((r) => (
                <li key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{r.name || "Sem nome"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {displayPhone(r.phone, canViewPhoneFn(r as any))}
                        {r.email ? ` · ${r.email}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <StageBadge stage={r.stage ?? "novo"} />
                        <span>{nameOf(r)}</span>
                        {r.credit_value ? <span className="font-semibold tabular-nums text-success">· {fmtBRL(r.credit_value)}</span> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">Entrada: {fmtDate(r.created_at)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Link to={`/leads?lead=${r.id}`} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">Abrir</Link>
                      <Link to={`/conversas?lead=${r.id}`} className="flex justify-center rounded-lg border-2 border-primary/40 bg-card p-1.5 text-primary transition hover:bg-muted" aria-label="Abrir conversa">
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs font-bold uppercase tracking-wide text-primary">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Consultor</th>
                    <th className="px-4 py-3 font-semibold">Etapa</th>
                    <th className="px-4 py-3 font-semibold">Valor</th>
                    <th className="px-4 py-3 font-semibold">Entrada</th>
                    <th className="px-4 py-3 font-semibold">Atualizado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.name || "Sem nome"}</div>
                        <div className="text-xs text-muted-foreground">
                          {displayPhone(r.phone, canViewPhoneFn(r as any))}
                          {r.email ? ` · ${r.email}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{nameOf(r)}</td>
                      <td className="px-4 py-3"><StageBadge stage={r.stage ?? "novo"} /></td>
                      <td className="px-4 py-3 tabular-nums">{fmtBRL(r.credit_value)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link to={`/leads?lead=${r.id}`} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">Abrir</Link>
                          <Link to={`/conversas?lead=${r.id}`} className="rounded-lg border-2 border-primary/40 bg-card p-1.5 text-primary transition hover:bg-muted" aria-label="Abrir conversa">
                            <MessageCircle className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
