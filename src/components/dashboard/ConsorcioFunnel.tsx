import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionTitle } from "@/components/dashboard/ExecutiveWidgets";
import { TrendingDown, AlertCircle, DollarSign, ExternalLink, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/data/mock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router-dom";

export type FunnelPeriod = "today" | "yesterday" | "7d" | "month" | "last_month" | "all" | "custom";
export type FunnelCustomRange = { start: Date | null; end: Date | null };

type FunnelStage = { key: Stage; stage: string; count: number };
type LostReason = { reason: string; count: number; pct: number };
export type SaleEntry = {
  id: string;
  name: string;
  phone: string;
  value: number;
  consultant: string;
  source: string;
  assetType?: string | null;
  soldAt?: string | null;
};

// Progressão coerente com o pipeline, sem repetir cor.
// Cada etapa avança no espectro: indigo → âmbar → azul → violeta → esmeralda.
const STAGE_STYLE: Record<Stage, { color: string; label: string }> = {
  novo:        { color: "hsl(var(--stage-new))",     label: "Novo Lead" },        // indigo
  qualificado: { color: "hsl(var(--stage-service))", label: "Em Atendimento" },   // âmbar
  agendado:    { color: "hsl(var(--info))",          label: "Simulação Enviada" },// azul
  compareceu:  { color: "hsl(262 83% 58%)",          label: "Reunião" },  // violeta
  comprou:     { color: "hsl(var(--success))",       label: "Cota Vendida" },     // esmeralda
  perdido:     { color: "hsl(var(--destructive))",   label: "Desqualificado" },
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

interface Props {
  funnel: FunnelStage[];          // sem "perdido"
  lost: number;                    // total desqualificados
  lostReasons?: LostReason[];      // opcional, mostra ao lado
  /** compact = sem coluna lateral (usado em dashboard pessoal) */
  compact?: boolean;
  /** Lista de vendas para detalhar ao clicar na faixa verde */
  sales?: SaleEntry[];
  /** Renderiza uma tabela de vendas inline abaixo do funil (motivacional p/ consultores). */
  showSalesInline?: boolean;
  /** Oculta o telefone do lead nas listas de vendas (privacidade p/ consultores). */
  hideContact?: boolean;
  /** Título do card (padrão: "Funil de Consórcio"). */
  title?: string;
  /** Subtítulo do card. */
  subtitle?: string;
  /** Seletor de período opcional. Se fornecido, exibe os chips acima do funil. */
  period?: FunnelPeriod;
  onPeriodChange?: (p: FunnelPeriod) => void;
  customRange?: FunnelCustomRange;
  onCustomRangeChange?: (r: FunnelCustomRange) => void;
}

const PERIOD_CHIPS: { key: FunnelPeriod; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "Semana" },
  { key: "month", label: "Mês" },
  { key: "last_month", label: "Mês anterior" },
  { key: "all", label: "Tudo" },
  { key: "custom", label: "Personalizado" },

];

const fmtRange = (r?: FunnelCustomRange) => {
  if (!r?.start && !r?.end) return "Personalizado";
  const f = (d: Date | null) => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
  return `${f(r.start)} → ${f(r.end)}`;
};
const toInput = (d: Date | null) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
const fromInput = (s: string, endOfDay = false): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (endOfDay) dt.setHours(23, 59, 59, 999);
  return dt;
};

export function ConsorcioFunnel({
  funnel, lost, lostReasons = [], compact = false, sales,
  showSalesInline = false, hideContact = false,
  title = "Funil de Consórcio",
  subtitle = "Jornada do lead até a venda da cota",
  period, onPeriodChange, customRange, onCustomRangeChange,
}: Props) {
  const [salesOpen, setSalesOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const stages = funnel.filter((s) => s.key !== "perdido");
  const top = Math.max(1, stages[0]?.count ?? 1);
  const FUNNEL_W = 320;        // largura útil do funil
  const PAD_L = 54;            // espaço à esquerda p/ "-x%"
  const PAD_R = 150;           // espaço à direita p/ rótulos longos ("Simulação Enviada")
  const W = FUNNEL_W + PAD_L + PAD_R;
  const CENTER = PAD_L + FUNNEL_W / 2;
  const H = 60;
  const GAP = 6;
  const MIN_W = 80;

  const widthFor = (count: number) =>
    Math.max(MIN_W, (count / top) * FUNNEL_W);

  const showPeriodPicker = !!period && !!onPeriodChange;

  return (
    <Card className="overflow-hidden p-3 md:p-5">
      <SectionTitle
        title={title}
        sub={subtitle}
        action={
          <Badge variant="secondary" className="font-mono text-[11px]">
            {stages.reduce((s, x) => s + x.count, 0) + (lost || 0)} leads
          </Badge>

        }
      />

      {showPeriodPicker && (
        <div className="-mt-1 mb-4 flex flex-wrap items-center gap-1.5">
          {PERIOD_CHIPS.map((c) => {
            const active = period === c.key;
            if (c.key === "custom") {
              return (
                <Popover key="custom" open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => { onPeriodChange?.("custom"); setCustomOpen(true); }}
                    >
                      <CalendarRange className="h-3.5 w-3.5" />
                      {active ? fmtRange(customRange) : "Personalizado"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 space-y-3 p-3 pointer-events-auto" align="start">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">De</label>
                      <input
                        type="date"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={toInput(customRange?.start ?? null)}
                        onChange={(e) => onCustomRangeChange?.({ start: fromInput(e.target.value), end: customRange?.end ?? null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Até</label>
                      <input
                        type="date"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={toInput(customRange?.end ?? null)}
                        onChange={(e) => onCustomRangeChange?.({ start: customRange?.start ?? null, end: fromInput(e.target.value, true) })}
                      />
                    </div>
                    <Button size="sm" className="w-full" onClick={() => setCustomOpen(false)}>Aplicar</Button>
                  </PopoverContent>
                </Popover>
              );
            }
            return (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => onPeriodChange?.(c.key)}
              >
                {c.label}
              </Button>
            );
          })}
        </div>
      )}



      <div className={cn("grid gap-5", !compact && "lg:grid-cols-[1.4fr_1fr]")}>
        {/* COLUNA 1 — Funil visual */}
        <div className="flex flex-col items-center">
          <svg
            viewBox={`0 0 ${W} ${(H + GAP) * stages.length}`}
            className="block w-full max-w-2xl"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Funil de conversão de consórcio"
          >
            <defs>
              {stages.map((s) => {
                const color = STAGE_STYLE[s.key].color;
                return (
                  <linearGradient key={s.key} id={`funnel-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.82} />
                  </linearGradient>
                );
              })}
              <filter id="funnel-shadow" x="-5%" y="-5%" width="110%" height="120%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.18" />
              </filter>
            </defs>
            {stages.map((s, i) => {
              const style = STAGE_STYLE[s.key];
              const w = widthFor(s.count);
              const wNext = stages[i + 1] ? widthFor(stages[i + 1].count) : w * 0.78;
              const y = i * (H + GAP);
              const x1 = CENTER - w / 2;
              const x2 = CENTER + w / 2;
              const xn1 = CENTER - wNext / 2;
              const xn2 = CENTER + wNext / 2;
              const points = `${x1},${y} ${x2},${y} ${xn2},${y + H} ${xn1},${y + H}`;
              const prev = stages[i - 1];
              const dropPct =
                prev && prev.count > 0
                  ? Math.round(((prev.count - s.count) / prev.count) * 100)
                  : null;
              const isSold = s.key === "comprou";
              const clickable = isSold && !!sales;
              const onClick = clickable ? () => setSalesOpen(true) : undefined;
              return (
                <g
                  key={s.key}
                  onClick={onClick}
                  style={clickable ? { cursor: "pointer" } : undefined}
                >
                  <polygon
                    points={points}
                    fill={`url(#funnel-grad-${s.key})`}
                    filter="url(#funnel-shadow)"
                    className={cn("transition-opacity hover:opacity-95", clickable && "hover:opacity-80")}
                  />

                  {/* Quantidade ao centro */}
                  <text
                    x={CENTER}
                    y={y + H / 2 + 7}
                    textAnchor="middle"
                    className="fill-white font-display pointer-events-none"
                    style={{ fontSize: 26, fontWeight: 800 }}
                  >
                    {s.count}
                  </text>
                  {/* Label à direita */}
                  <text
                    x={x2 + 10}
                    y={y + H / 2 + 5}
                    className={cn("fill-foreground pointer-events-none", clickable && "underline-offset-2")}
                    style={{ fontSize: 15, fontWeight: 600 }}
                  >
                    {style.label}{clickable ? "  ›" : ""}
                  </text>
                  {/* Queda entre etapas à esquerda */}
                  {dropPct !== null && dropPct > 0 && (
                    <text
                      x={x1 - 10}
                      y={y + H / 2 + 5}
                      textAnchor="end"
                      className="fill-muted-foreground pointer-events-none"
                      style={{ fontSize: 13, fontWeight: 600 }}
                    >
                      -{dropPct}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Desqualificados — base do funil */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-1.5 text-sm">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <span className="font-semibold text-rose-600 tabular-nums">{lost}</span>
            <span className="text-muted-foreground">desqualificados no período</span>
          </div>
        </div>

        {/* COLUNA 2 — Motivos / Taxa de conversão */}
        {!compact && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Conversão por etapa
              </div>
              <div className="space-y-1.5">
                {stages.map((s, i) => {
                  const next = stages[i + 1];
                  if (!next || s.count === 0) return null;
                  const conv = Math.round((next.count / s.count) * 100);
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-muted-foreground">
                        {STAGE_STYLE[s.key].label} → {STAGE_STYLE[next.key].label}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums",
                          conv >= 60
                            ? "bg-emerald-500/15 text-emerald-600"
                            : conv >= 30
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-rose-500/15 text-rose-600",
                        )}
                      >
                        {conv}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {lostReasons.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Motivos de desqualificação
                </div>
                <div className="space-y-2">
                  {lostReasons.slice(0, 5).map((r) => (
                    <div key={r.reason}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate font-medium">{r.reason}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.count} ({r.pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-rose-500/70"
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Taxa global */}
            {stages[0]?.count > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Conversão total
                </div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {(((stages[stages.length - 1]?.count ?? 0) / stages[0].count) * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground">
                  do Novo Lead até a Cota Vendida
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showSalesInline && sales && sales.length > 0 && (
        <div className="mt-5 rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b bg-emerald-500/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <DollarSign className="h-4 w-4" />
              Vendas do time no período
            </div>
            <Badge variant="secondary" className="font-mono text-[11px]">
              {sales.length} · {fmtBRL(sales.reduce((s, x) => s + x.value, 0))}
            </Badge>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Consultor</th>
                  <th className="px-3 py-2 text-left">Origem</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Fechada em</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{sale.name}</div>
                      {sale.assetType && (
                        <div className="text-[11px] text-muted-foreground">{sale.assetType}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{sale.consultant}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-[10px]">{sale.source}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-600">
                      {fmtBRL(sale.value)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(sale.soldAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            Cada cota fechada aqui é motivação: bora somar a sua? 🚀
          </div>
        </div>
      )}

      <Dialog open={salesOpen} onOpenChange={setSalesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Vendas no período
            </DialogTitle>
            <DialogDescription>
              {sales?.length ?? 0} cota{(sales?.length ?? 0) === 1 ? "" : "s"} vendida{(sales?.length ?? 0) === 1 ? "" : "s"} ·
              {" "}Total {fmtBRL((sales ?? []).reduce((s, x) => s + x.value, 0))}
            </DialogDescription>
          </DialogHeader>

          {(!sales || sales.length === 0) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma venda registrada no período selecionado.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Consultor</th>
                    <th className="px-3 py-2 text-left">Origem</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-left">Fechada em</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium">{sale.name}</div>
                        {sale.phone && !hideContact && (
                          <div className="text-[11px] text-muted-foreground">{sale.phone}</div>
                        )}
                        {sale.assetType && (
                          <div className="text-[11px] text-muted-foreground">{sale.assetType}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{sale.consultant}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px]">{sale.source}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-600">
                        {fmtBRL(sale.value)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(sale.soldAt)}</td>
                      <td className="px-3 py-2 text-right">
                        {!hideContact && (
                          <Link
                            to={`/conversas?leadId=${sale.id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => setSalesOpen(false)}
                          >
                            Abrir <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-semibold">
                  <tr className="border-t">
                    <td className="px-3 py-2" colSpan={3}>Total</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                      {fmtBRL(sales.reduce((s, x) => s + x.value, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
