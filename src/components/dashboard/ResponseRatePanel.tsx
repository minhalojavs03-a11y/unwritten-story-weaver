import { useMemo, useState } from "react";
import { Bot, User, MessageSquare, Users, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useResponseRateStats, safePct, type ResponseRateStats } from "@/hooks/useResponseRateStats";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PresetKey = "today" | "7d" | "30d" | "custom";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }

function rangesFor(preset: PresetKey, custom?: { from: Date; to: Date }) {
  const now = new Date();
  if (preset === "today") {
    const cs = startOfDay(now), ce = endOfDay(now);
    const ps = startOfDay(addDays(now, -1)), pe = endOfDay(addDays(now, -1));
    return { curr: { start: cs, end: ce, label: "Hoje" }, prev: { start: ps, end: pe, label: "Ontem" } };
  }
  if (preset === "7d") {
    const ce = now;
    const cs = addDays(startOfDay(now), -6);
    const pe = addDays(cs, -1); pe.setHours(23,59,59,999);
    const ps = addDays(startOfDay(pe), -6);
    return { curr: { start: cs, end: ce, label: "Últimos 7 dias" }, prev: { start: ps, end: pe, label: "7 dias anteriores" } };
  }
  if (preset === "30d") {
    const ce = now;
    const cs = addDays(startOfDay(now), -29);
    const pe = addDays(cs, -1); pe.setHours(23,59,59,999);
    const ps = addDays(startOfDay(pe), -29);
    return { curr: { start: cs, end: ce, label: "Últimos 30 dias" }, prev: { start: ps, end: pe, label: "30 dias anteriores" } };
  }
  // custom
  const from = custom?.from ?? addDays(now, -6);
  const to = custom?.to ?? now;
  const cs = startOfDay(from), ce = endOfDay(to);
  const days = Math.max(1, Math.round((ce.getTime() - cs.getTime()) / 86400000));
  const pe = addDays(cs, -1); pe.setHours(23,59,59,999);
  const ps = addDays(startOfDay(pe), -(days - 1));
  return { curr: { start: cs, end: ce, label: `${format(cs,"dd/MM")} – ${format(ce,"dd/MM")}` }, prev: { start: ps, end: pe, label: "Período anterior" } };
}

function Delta({ curr, prev }: { curr: number; prev: number }) {
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground"><Minus className="h-3 w-3" />0,0pp</span>;
  }
  const up = diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{diff.toFixed(1)}pp
    </span>
  );
}

function ActorRow({
  icon: Icon, label, tone, currSent, currReplied, prevSent, prevReplied,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "ai" | "human";
  currSent: number; currReplied: number; prevSent: number; prevReplied: number;
}) {
  const currPct = safePct(currReplied, currSent);
  const prevPct = safePct(prevReplied, prevSent);
  const toneCls = tone === "ai"
    ? "bg-[hsl(var(--primary))]/10 text-primary ring-primary/20"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20";
  const barCls = tone === "ai" ? "bg-primary" : "bg-emerald-500";
  return (
    <div className="space-y-2 rounded-xl border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg ring-1", toneCls)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <Delta curr={currPct} prev={prevPct} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-display text-3xl font-bold tabular-nums leading-none">
          {currPct.toFixed(1)}<span className="ml-0.5 text-base font-semibold text-muted-foreground">%</span>
        </div>
        <div className="text-right text-[11px] leading-tight text-muted-foreground">
          <div className="tabular-nums"><span className="font-semibold text-foreground">{currReplied}</span> / {currSent} respondidas</div>
          <div className="tabular-nums opacity-70">anterior: {prevPct.toFixed(1)}% ({prevReplied}/{prevSent})</div>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barCls)} style={{ width: `${Math.min(100, currPct)}%` }} />
      </div>
    </div>
  );
}

function PanelContent({ curr, prev, scope }: {
  curr: { data?: ResponseRateStats; isLoading: boolean; label: string };
  prev: { data?: ResponseRateStats; isLoading: boolean; label: string };
  scope: "messages" | "leads";
}) {
  const c = curr.data; const p = prev.data;
  if (curr.isLoading || prev.isLoading || !c || !p) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (scope === "messages") {
    const cAi = c.messages.ai, cHu = c.messages.human;
    const pAi = p.messages.ai, pHu = p.messages.human;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <ActorRow icon={Bot}  label="IA"      tone="ai"    currSent={cAi.sent} currReplied={cAi.replied} prevSent={pAi.sent} prevReplied={pAi.replied} />
        <ActorRow icon={User} label="Humanos" tone="human" currSent={cHu.sent} currReplied={cHu.replied} prevSent={pHu.sent} prevReplied={pHu.replied} />
      </div>
    );
  }
  const cAi = c.leads.ai, cHu = c.leads.human;
  const pAi = p.leads.ai, pHu = p.leads.human;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ActorRow icon={Bot}  label="IA"      tone="ai"    currSent={cAi.leads_contacted} currReplied={cAi.leads_responded} prevSent={pAi.leads_contacted} prevReplied={pAi.leads_responded} />
      <ActorRow icon={User} label="Humanos" tone="human" currSent={cHu.leads_contacted} currReplied={cHu.leads_responded} prevSent={pHu.leads_contacted} prevReplied={pHu.leads_responded} />
    </div>
  );
}

export function ResponseRatePanel({
  memberId,
  compact = false,
  className,
}: {
  memberId?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const [preset, setPreset] = useState<PresetKey>("7d");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(() => {
    const now = new Date(); return { from: addDays(now, -6), to: now };
  });
  const [scope, setScope] = useState<"messages" | "leads">("messages");

  const { curr, prev } = useMemo(() => rangesFor(preset, customRange), [preset, customRange]);

  const currQ = useResponseRateStats(curr.start, curr.end, memberId);
  const prevQ = useResponseRateStats(prev.start, prev.end, memberId);

  return (
    <Card className={cn("relative overflow-hidden p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold leading-tight">Taxa de resposta — IA vs Humanos</h3>
              <p className="text-[11px] text-muted-foreground">{curr.label} <span className="opacity-60">vs</span> {prev.label}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
            <TabsList className="h-8">
              <TabsTrigger value="today" className="h-7 px-2 text-[11px]">Hoje</TabsTrigger>
              <TabsTrigger value="7d"    className="h-7 px-2 text-[11px]">7d</TabsTrigger>
              <TabsTrigger value="30d"   className="h-7 px-2 text-[11px]">30d</TabsTrigger>
              <TabsTrigger value="custom" className="h-7 px-2 text-[11px]">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          {preset === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[11px]">
                  {format(customRange.from, "dd/MM", { locale: ptBR })} – {format(customRange.to, "dd/MM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  onSelect={(r) => { if (r?.from && r?.to) setCustomRange({ from: r.from, to: r.to }); }}
                  numberOfMonths={2}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as "messages" | "leads")} className="mt-4">
        <TabsList className="h-8">
          <TabsTrigger value="messages" className="h-7 gap-1.5 px-2 text-[11px]"><MessageSquare className="h-3 w-3" />Por mensagem</TabsTrigger>
          <TabsTrigger value="leads"    className="h-7 gap-1.5 px-2 text-[11px]"><Users className="h-3 w-3" />Por lead (1º contato)</TabsTrigger>
        </TabsList>
        <TabsContent value="messages" className="mt-3">
          <PanelContent curr={{ data: currQ.data, isLoading: currQ.isLoading, label: curr.label }} prev={{ data: prevQ.data, isLoading: prevQ.isLoading, label: prev.label }} scope="messages" />
        </TabsContent>
        <TabsContent value="leads" className="mt-3">
          <PanelContent curr={{ data: currQ.data, isLoading: currQ.isLoading, label: curr.label }} prev={{ data: prevQ.data, isLoading: prevQ.isLoading, label: prev.label }} scope="leads" />
        </TabsContent>
      </Tabs>

      {!compact && currQ.data && (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 text-[11px] md:grid-cols-4">
          <div><div className="text-muted-foreground">Msgs enviadas</div><div className="font-semibold tabular-nums">{currQ.data.messages.total.sent}</div></div>
          <div><div className="text-muted-foreground">Respondidas</div><div className="font-semibold tabular-nums">{currQ.data.messages.total.replied}</div></div>
          <div><div className="text-muted-foreground">Leads contatados</div><div className="font-semibold tabular-nums">{currQ.data.leads.total.leads_contacted}</div></div>
          <div><div className="text-muted-foreground">Leads que responderam</div><div className="font-semibold tabular-nums">{currQ.data.leads.total.leads_responded}</div></div>
        </div>
      )}
    </Card>
  );
}
