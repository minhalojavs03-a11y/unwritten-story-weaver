import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mic, MessageCircle, Check, ExternalLink, Filter, Sparkles, Loader2, FileCheck2, RefreshCw, Download } from "lucide-react";
import { PageHeader } from "@/pages/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { toast } from "@/hooks/use-toast";
import { useCoachingInsights, resolveInsight, runCoachingBackfill, type CoachingInsight } from "@/hooks/useCoachingInsights";
import { exportCoachingPdf } from "@/lib/exportCoachingPdf";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { usePermissions } from "@/hooks/usePermissions";

const TYPE_META: Record<CoachingInsight["insight_type"], { label: string; icon: any; tone: string }> = {
  missed_buying_signal: { label: "Sinal de compra perdido", icon: AlertTriangle, tone: "text-red-600 bg-red-50 border-red-200" },
  should_be_audio: { label: "Devia ter sido áudio", icon: Mic, tone: "text-amber-700 bg-amber-50 border-amber-200" },
  low_assertiveness: { label: "Pouco assertivo", icon: MessageCircle, tone: "text-blue-700 bg-blue-50 border-blue-200" },
  objection_unhandled: { label: "Objeção mal tratada", icon: AlertTriangle, tone: "text-purple-700 bg-purple-50 border-purple-200" },
  simulation_sent: { label: "Simulação enviada", icon: FileCheck2, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
};

const SEV_META: Record<CoachingInsight["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-muted text-muted-foreground",
};

export default function CoachingPage() {
  const [tab, setTab] = useState<"all" | "missed_buying_signal" | "should_be_audio" | "simulation_sent">("all");
  const [days, setDays] = useState(14);
  const [backfilling, setBackfilling] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const { member } = useActiveMember();
  const { can } = usePermissions();
  const canViewAll = can("view_team_metrics");
  const { data: insights = [], isLoading } = useCoachingInsights({
    days,
    memberId: canViewAll ? undefined : member?.id,
    enabled: canViewAll || !!member?.id,
  });
  const qc = useQueryClient();

  async function handleBackfill(force = false) {
    if (force && !window.confirm("Isso vai apagar os alertas atuais (não tratados) dos últimos 30 dias e rodar a análise novamente já considerando áudio transcrito e simulações. Continuar?")) {
      return;
    }
    const setter = force ? setReanalyzing : setBackfilling;
    setter(true);
    try {
      const res = await runCoachingBackfill(30, force);
      const queued = res.queued ?? 0;
      toast({
        title: queued === 0 ? "Nada para analisar" : force ? "Reanalisando com IA atualizada" : "Análise rodando em segundo plano",
        description: queued === 0
          ? `${res.skipped ?? 0} mensagens já tinham sido analisadas.`
          : `${queued} mensagens na fila${force ? " (reanálise forçada)" : ` · ${res.skipped ?? 0} já analisadas`}. Os alertas vão aparecendo aos poucos.`,
      });
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ["coaching_insights"] });
        qc.invalidateQueries({ queryKey: ["coaching_by_member"] });
      };
      [5000, 15000, 30000, 60000, 120000, 180000].forEach(ms => setTimeout(refresh, ms));
    } catch (e: any) {
      toast({ title: "Erro ao rodar análise", description: e.message, variant: "destructive" });
    } finally {
      setter(false);
    }
  }

  const filtered = useMemo(() => {
    if (tab === "all") return insights;
    return insights.filter(i => i.insight_type === tab);
  }, [insights, tab]);

  const byMember = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; url: string | null; total: number; high: number; simulations: number }>();
    for (const i of insights) {
      const key = i.member?.id ?? "—";
      const name = i.member?.display_name ?? "Sem responsável";
      const cur = map.get(key) ?? { name, color: i.member?.avatar_color ?? null, url: i.member?.avatar_url ?? null, total: 0, high: 0, simulations: 0 };
      if (i.insight_type === "simulation_sent") {
        cur.simulations += 1;
      } else {
        cur.total += 1;
        if (i.severity === "high") cur.high += 1;
      }
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.total + b.simulations) - (a.total + a.simulations));
  }, [insights]);

  async function handleResolve(id: string) {
    try {
      await resolveInsight(id);
      qc.invalidateQueries({ queryKey: ["coaching_insights"] });
      toast({ title: "Marcado como tratado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  const countByType = useMemo(() => ({
    all: insights.length,
    missed_buying_signal: insights.filter(i => i.insight_type === "missed_buying_signal").length,
    should_be_audio: insights.filter(i => i.insight_type === "should_be_audio").length,
    simulation_sent: insights.filter(i => i.insight_type === "simulation_sent").length,
  }), [insights]);

  const TAB_LABEL: Record<typeof tab, string> = {
    all: "Tudo",
    missed_buying_signal: "Sinal de compra perdido",
    should_be_audio: "Devia ter sido áudio",
    simulation_sent: "Simulações enviadas",
  };

  function handleExportPdf() {
    try {
      exportCoachingPdf({ insights: filtered, days, tabLabel: TAB_LABEL[tab], byMember });
      toast({ title: "PDF gerado", description: `${filtered.length} item(ns) exportados.` });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Coaching de atendimento"
        subtitle="A IA audita as conversas dos consultores e aponta sinais de compra perdidos e respostas que deveriam ter sido áudio."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button size="sm" variant="outline" onClick={() => handleBackfill(false)} disabled={backfilling || reanalyzing} className="h-7 gap-1.5">
              {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Analisar novas (30d)
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBackfill(true)} disabled={backfilling || reanalyzing} className="h-7 gap-1.5 border-primary/40 text-primary hover:bg-primary/10">
              {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reanalisar com IA atualizada
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={filtered.length === 0} className="h-7 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Baixar PDF
            </Button>
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full border px-3 py-1 ${days === d ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {/* Resumo por consultor */}
      {canViewAll && byMember.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por consultor (últimos {days} dias)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {byMember.map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border bg-background/50 p-3">
                <UserAvatar name={m.name} avatarColor={m.color ?? undefined} avatarUrl={m.url ?? undefined} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.total} alerta{m.total !== 1 ? "s" : ""}
                    {m.high > 0 ? ` · ${m.high} crítico${m.high > 1 ? "s" : ""}` : ""}
                    {m.simulations > 0 ? ` · ${m.simulations} simulação${m.simulations > 1 ? "ões" : ""}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {m.simulations > 0 && (
                    <div className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700" title="Simulações enviadas">
                      ✓{m.simulations}
                    </div>
                  )}
                  <div className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.high > 0 ? "bg-red-100 text-red-700" : m.total > 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    {m.total}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="all">Tudo ({countByType.all})</TabsTrigger>
            <TabsTrigger value="missed_buying_signal">Sinal perdido ({countByType.missed_buying_signal})</TabsTrigger>
            <TabsTrigger value="should_be_audio">Devia ser áudio ({countByType.should_be_audio})</TabsTrigger>
            <TabsTrigger value="simulation_sent">Simulações ({countByType.simulation_sent})</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {!canViewAll && !member?.id && (
        <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">Selecione seu perfil no topo da página para ver seus insights.</p>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando análises…</p>}
      {!isLoading && filtered.length === 0 && (canViewAll || !!member?.id) && (
        <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum alerta nos últimos {days} dias. 🎯</p>
          <p className="mt-1 text-xs text-muted-foreground">A análise é automática a cada mensagem enviada pelo consultor.</p>
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map(i => <InsightCard key={i.id} insight={i} showMember={canViewAll} onResolve={() => handleResolve(i.id)} />)}
      </div>
    </div>
  );
}

function InsightCard({ insight, showMember, onResolve }: { insight: CoachingInsight; showMember?: boolean; onResolve: () => void }) {
  const meta = TYPE_META[insight.insight_type];
  const Icon = meta.icon;
  return (
    <article className="overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold break-words">{insight.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEV_META[insight.severity]}`}>{insight.severity}</span>
              <span className="text-[11px] text-muted-foreground">{new Date(insight.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {(showMember ? insight.member : false) || insight.lead?.name ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {showMember && insight.member && (
                  <>
                    <UserAvatar name={insight.member.display_name ?? ""} avatarColor={insight.member.avatar_color ?? undefined} avatarUrl={insight.member.avatar_url ?? undefined} size={24} />
                    <span className="truncate">{insight.member.display_name}</span>
                    {insight.lead?.name && <span>·</span>}
                  </>
                )}
                {insight.lead?.name && <span className="truncate min-w-0">Lead: {insight.lead.name}</span>}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Link to={insight.lead_id ? `/conversas?lead=${insight.lead_id}` : `/conversas`} className="flex-1 sm:flex-initial">
            <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 sm:w-auto" disabled={!insight.lead_id}>
              <ExternalLink className="h-3.5 w-3.5" /> Ver conversa
            </Button>
          </Link>
          <Button size="sm" variant="ghost" className="h-8 flex-1 gap-1.5 sm:flex-initial" onClick={onResolve}>
            <Check className="h-3.5 w-3.5" /> Tratado
          </Button>
        </div>
      </div>

      {insight.detail && <p className="mt-3 text-sm text-foreground/80 break-words">{insight.detail}</p>}

      {insight.signal_quote && (
        <div className="mt-3 rounded-lg border-l-2 border-red-300 bg-red-50/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Cliente disse</p>
          <p className="mt-0.5 text-sm italic text-foreground/90">"{insight.signal_quote}"</p>
        </div>
      )}
      {insight.consultant_quote && (
        <div className="mt-2 rounded-lg border-l-2 border-muted bg-muted/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Consultor respondeu</p>
          <p className="mt-0.5 text-sm text-foreground/80 line-clamp-3">{insight.consultant_quote}</p>
        </div>
      )}
      {insight.suggestion && (
        <div className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-emerald-50/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Sugestão da IA</p>
          <p className="mt-0.5 text-sm text-foreground/90">{insight.suggestion}</p>
        </div>
      )}
    </article>
  );
}
