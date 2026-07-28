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
  const memberFilter = params.get("member") || "todos";
  const qs = (over: Record<string, string>) => {
    const base = { metric, scope, stage: stageFilter, member: memberFilter, ...over };
    const sp = new URLSearchParams(base);
    const gap = params.get("gap");
    if (gap) sp.set("gap", gap);
    return `/funil/leads?${sp.toString()}`;
  };
  const cfg = METRICS[metric] ?? METRICS.leads;
  const canViewPhoneFn = useCanViewLeadPhone();


  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<{ id: string; user_id: string | null; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Quando a célula de Defasagem manda ?gap=-280, a lista precisa mostrar
  // exatamente esses 280 leads (os mais recentes sem avanço), não o universo inteiro.
  const gapLimit = useMemo(() => {
    const raw = params.get("gap");
    if (!raw) return null;
    const n = Math.abs(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params]);

  const scopedRows = useMemo(() => (gapLimit ? rows.slice(0, gapLimit) : rows), [rows, gapLimit]);

  const visibleRows = useMemo(
    () => (stageFilter === "todas" ? scopedRows : scopedRows.filter((r) => (r.stage ?? "novo") === stageFilter)),
    [scopedRows, stageFilter],
  );
  const total = visibleRows.length;

  return (
    <>
      <PageHeader
        title={`${cfg.label}: ${loading ? "…" : total}`}
        subtitle={`${cfg.subtitle} · ${scope === "month" ? "Mês atual" : "Histórico completo"}${
          gapLimit ? ` · Defasagem exata da meta: ${gapLimit} leads` : ""
        }`}
        actions={
          <Link to="/crm" className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Início
          </Link>
        }
      />

      <div className="w-full max-w-full space-y-4 overflow-x-hidden p-3 md:p-8">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(METRICS) as Metric[]).map((k) => (
            <Link
              key={k}
              to={`/funil/leads?metric=${k}&scope=${scope}&stage=${stageFilter}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                k === metric ? "bg-foreground text-background" : "border border-black/10 bg-card hover:bg-muted",
              )}
            >
              {METRICS[k].label}
            </Link>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(["month", "all"] as const).map((s) => (
            <Link
              key={s}
              to={`/funil/leads?metric=${metric}&scope=${s}&stage=${stageFilter}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                s === scope ? "bg-foreground text-background" : "border border-black/10 bg-card hover:bg-muted",
              )}
            >
              {s === "month" ? "Mês atual" : "Tudo"}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etapa</span>
          {(["todas", ...stageOrder] as const).map((s) => {
            const count = s === "todas" ? scopedRows.length : scopedRows.filter((r) => (r.stage ?? "novo") === s).length;
            return (
              <Link
                key={s}
                to={`/funil/leads?metric=${metric}&scope=${scope}&stage=${s}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  s === stageFilter ? "bg-primary text-primary-foreground" : "border border-black/10 bg-card hover:bg-muted",
                )}
              >
                {s === "todas" ? "Todas" : stageLabels[s]}
                <span className="ml-1 tabular-nums opacity-70">{loading ? "" : count}</span>
              </Link>
            );
          })}
        </div>


        <div className="overflow-hidden rounded-2xl border bg-card">
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
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">
                          {stageLabels[(r.stage ?? "novo") as keyof typeof stageLabels] ?? r.stage}
                        </span>
                        <span>{nameOf(r)}</span>
                        {r.credit_value ? <span className="tabular-nums">· {fmtBRL(r.credit_value)}</span> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">Entrada: {fmtDate(r.created_at)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Link to={`/leads?lead=${r.id}`} className="rounded-lg border px-2 py-1 text-xs hover:bg-muted">Abrir</Link>
                      <Link to={`/conversas?lead=${r.id}`} className="flex justify-center rounded-lg border p-1.5 hover:bg-muted" aria-label="Abrir conversa">
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                      <td className="px-4 py-3">{stageLabels[(r.stage ?? "novo") as keyof typeof stageLabels] ?? r.stage}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtBRL(r.credit_value)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link to={`/leads?lead=${r.id}`} className="rounded-lg border px-2 py-1 text-xs hover:bg-muted">Abrir</Link>
                          <Link to={`/conversas?lead=${r.id}`} className="rounded-lg border p-1.5 hover:bg-muted" aria-label="Abrir conversa">
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
