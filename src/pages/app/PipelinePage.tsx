import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "./PageHeader";
import { stageLabels, stageOrder, stageColorClass, type Stage, type Temperature } from "@/data/mock";
import { timeAgo, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCanViewLeadPhone } from "@/lib/leadPrivacy";
import { useLeads, useUpdateLead } from "@/hooks/useData";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import {
  Clock, Plus, GripVertical, Settings2, Rows3, Rows2, LayoutGrid, Columns3, StretchVertical,
  ChevronDown, Flame, AlertTriangle, TrendingUp, Wallet, Users, CheckCircle2, BarChart3,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QuickScheduleButton } from "@/components/leads/QuickScheduleButton";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";

type Density = "compact" | "comfortable" | "spacious";
type Layout = "kanban" | "stacked";


type CardFields = {
  phone: boolean;
  interest: boolean;
  temperature: boolean;
  lastContact: boolean;
  avatar: boolean;
  stageStripe: boolean;
};

const DEFAULT_FIELDS: CardFields = {
  phone: true,
  interest: true,
  temperature: true,
  lastContact: true,
  avatar: true,
  stageStripe: true,
};

const STORAGE_KEY = "pipeline.view.v1";

const tempDot: Record<Temperature, string> = {
  hot: "bg-destructive",
  warm: "bg-warning",
  cold: "bg-info",
};

const tempLabel: Record<Temperature, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
};

function initials(name?: string | null, phone?: string | null) {
  const src = (name ?? phone ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatInterest(raw?: string | null) {
  if (!raw) return null;
  return raw
    .replace(/_/g, " ")
    .replace(/\br\$/gi, "R$")
    .replace(/\s-\s/g, " – ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12) {
    const cc = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const mid = rest.slice(0, rest.length - 4);
    const end = rest.slice(-4);
    return `+${cc} (${ddd}) ${mid}-${end}`;
  }
  return phone;
}

function useViewSettings() {
  const [density, setDensity] = useState<Density>("comfortable");
  const [layout, setLayout] = useState<Layout>("kanban");
  const [fields, setFields] = useState<CardFields>(DEFAULT_FIELDS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.density) setDensity(parsed.density);
        if (parsed.layout) setLayout(parsed.layout);
        if (parsed.fields) setFields({ ...DEFAULT_FIELDS, ...parsed.fields });
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ density, layout, fields }));
    } catch {
      /* noop */
    }
  }, [density, layout, fields]);

  return { density, setDensity, layout, setLayout, fields, setFields };
}

export default function PipelinePage() {
  const { data: allLeads = [], isLoading } = useLeads();
  const update = useUpdateLead();
  const navigate = useNavigate();
  const { density, setDensity, layout, setLayout, fields, setFields } = useViewSettings();
  const isMobile = useIsMobile();
  const effectiveLayout: Layout = isMobile ? "stacked" : layout;
  const { member: activeMember } = useActiveMember();
  const { can } = usePermissions();
  const canSeeAll = can("assume_any_lead");
  const leads = canSeeAll
    ? allLeads
    : allLeads.filter((l) => !!activeMember?.id && l.assigned_member_id === activeMember.id);
  const grouped = stageOrder.map((s) => ({ stage: s, leads: leads.filter((l) => l.stage === s) }));

  // Métricas por etapa (gargalo, conversão, valor total, dias médios)
  const stageMetrics = useMemo(() => {
    const now = Date.now();
    const map = {} as Record<Stage, { count: number; avgDays: number; totalValue: number; convRate: number | null; bottleneck: "ok" | "warning" | "critical" }>;
    grouped.forEach(({ stage, leads }, i) => {
      const count = leads.length;
      const totalValue = leads.reduce((s, l) => s + (Number(l.credit_value) || 0), 0);
      const avgMs = count
        ? leads.reduce((s, l) => s + (now - new Date(l.updated_at ?? l.created_at).getTime()), 0) / count
        : 0;
      const avgDays = avgMs / 86_400_000;
      const next = grouped[i + 1];
      const convRate = stage === "perdido" ? null
        : next && count > 0 ? Math.min(100, Math.round((next.leads.length / count) * 100))
        : null;
      const bottleneck: "ok" | "warning" | "critical" =
        stage === "perdido" || stage === "comprou" ? "ok"
        : avgDays > 10 ? "critical" : avgDays > 6 ? "warning" : "ok";
      map[stage] = { count, avgDays, totalValue, convRate, bottleneck };
    });
    return map;
  }, [grouped]);

  const overview = useMemo(() => {
    const totalValue = leads.reduce((s, l) => s + (Number(l.credit_value) || 0), 0);
    const hot = leads.filter((l) => l.temperature === "hot" && l.stage !== "perdido" && l.stage !== "comprou").length;
    const stuck = leads.filter((l) => {
      if (l.stage === "perdido" || l.stage === "comprou") return false;
      const ts = new Date(l.updated_at ?? l.created_at).getTime();
      return (Date.now() - ts) / 86_400_000 >= 7;
    }).length;
    const won = leads.filter((l) => l.stage === "comprou").length;
    return { total: leads.length, totalValue, hot, stuck, won };
  }, [leads]);



  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  // Barra de rolagem horizontal externa (fixa na base da viewport), sincronizada com o kanban
  const kanbanRef = useRef<HTMLDivElement | null>(null);
  const proxyRef = useRef<HTMLDivElement | null>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [showProxy, setShowProxy] = useState(false);

  useEffect(() => {
    if (effectiveLayout !== "kanban") { setShowProxy(false); return; }
    const el = kanbanRef.current;
    const proxy = proxyRef.current;
    if (!el || !proxy) return;

    let syncing = false;
    const updateSize = () => {
      setScrollWidth(el.scrollWidth);
      const overflows = el.scrollWidth > el.clientWidth + 1;
      // sempre mostrar a barra externa quando houver overflow horizontal
      setShowProxy(overflows);
    };
    const onElScroll = () => {
      if (syncing) return;
      syncing = true;
      proxy.scrollLeft = el.scrollLeft;
      syncing = false;
    };
    const onProxyScroll = () => {
      if (syncing) return;
      syncing = true;
      el.scrollLeft = proxy.scrollLeft;
      syncing = false;
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    el.addEventListener("scroll", onElScroll, { passive: true });
    proxy.addEventListener("scroll", onProxyScroll, { passive: true });
    window.addEventListener("resize", updateSize);
    window.addEventListener("scroll", updateSize, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onElScroll);
      proxy.removeEventListener("scroll", onProxyScroll);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("scroll", updateSize);
    };
  }, [effectiveLayout, leads.length]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const stage = e.over?.id as Stage | undefined;
    if (id && stage && stageOrder.includes(stage)) {
      update.mutate({ id, patch: { stage } });
    }
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {/* Bloqueio de orientação landscape no mobile */}
      <div className="fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-3 bg-background p-6 text-center [@media(max-width:900px)_and_(orientation:landscape)]:flex">
        <div className="text-4xl">📱↺</div>
        <h2 className="text-lg font-semibold">Gire seu dispositivo</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          O pipeline é otimizado para o modo retrato no celular. Vire o aparelho na vertical para continuar.
        </p>
      </div>
      <PageHeader title="Pipeline de consórcios" subtitle="Arraste as cotas para mudar de estágio na jornada de venda" />
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden p-3 md:p-6">
        <div className="grid w-full min-w-0 max-w-full gap-3 lg:grid-cols-2">
          <OverviewBar overview={overview} />
          <FunnelOverview grouped={grouped} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm">

          <div>
            <span className="text-muted-foreground">Total no funil:</span>{" "}
            <strong>{leads.length} leads</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={layout}
              onValueChange={(v) => v && setLayout(v as Layout)}
              size="sm"
              variant="outline"
              className="hidden md:inline-flex"
            >
              <ToggleGroupItem value="kanban" aria-label="Kanban horizontal" title="Kanban (rolagem lateral)">
                <Columns3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="stacked" aria-label="Lista vertical" title="Lista vertical (rolagem para baixo)">
                <StretchVertical className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(v) => v && setDensity(v as Density)}
              size="sm"
              variant="outline"
            >
              <ToggleGroupItem value="compact" aria-label="Compacto" title="Compacto">
                <Rows3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="comfortable" aria-label="Confortável" title="Confortável">
                <Rows2 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="spacious" aria-label="Espaçoso" title="Espaçoso">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings2 className="h-4 w-4" />
                  Personalizar cards
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Campos visíveis</div>
                    <p className="text-xs text-muted-foreground">Escolha o que aparece em cada card.</p>
                  </div>
                  <Separator />
                  <FieldRow id="temperature" label="Temperatura" checked={fields.temperature}
                    onChange={(v) => setFields({ ...fields, temperature: v })} />
                  <FieldRow id="phone" label="Telefone" checked={fields.phone}
                    onChange={(v) => setFields({ ...fields, phone: v })} />
                  <FieldRow id="interest" label="Interesse / faixa" checked={fields.interest}
                    onChange={(v) => setFields({ ...fields, interest: v })} />
                  <FieldRow id="lastContact" label="Último contato" checked={fields.lastContact}
                    onChange={(v) => setFields({ ...fields, lastContact: v })} />
                  <FieldRow id="avatar" label="Avatar / iniciais" checked={fields.avatar}
                    onChange={(v) => setFields({ ...fields, avatar: v })} />
                  <FieldRow id="stageStripe" label="Faixa lateral colorida" checked={fields.stageStripe}
                    onChange={(v) => setFields({ ...fields, stageStripe: v })} />
                  <Separator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setFields(DEFAULT_FIELDS);
                      setDensity("comfortable");
                      setLayout("kanban");
                    }}
                  >
                    Restaurar padrão
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

          {effectiveLayout === "kanban" ? (
            <div ref={kanbanRef} className="pipeline-scroll -mx-3 flex w-[calc(100%+1.5rem)] min-w-0 max-w-[calc(100%+1.5rem)] items-start gap-3 overflow-x-scroll px-3 pb-2 md:mx-0 md:w-full md:max-w-full md:px-0">
              {grouped.map(({ stage, leads }) => (
                <StageColumn key={stage} stage={stage} count={leads.length} metrics={stageMetrics[stage]}>
                  {leads.length === 0 ? (
                    <EmptyStage />
                  ) : (
                    leads.map((l) => (
                      <RenderLeadCard
                        key={l.id}
                        lead={l}
                        stage={stage}
                        density={density}
                        fields={fields}
                        onOpen={() => navigate(`/conversas?lead=${l.id}`)}
                      />
                    ))
                  )}
                </StageColumn>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ stage, leads }) => (
                <StageSection key={stage} stage={stage} count={leads.length} metrics={stageMetrics[stage]}>
                  {leads.length === 0 ? (
                    <EmptyStage />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {leads.map((l) => (
                        <RenderLeadCard
                          key={l.id}
                          lead={l}
                          stage={stage}
                          density={density}
                          fields={fields}
                          onOpen={() => navigate(`/conversas?lead=${l.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </StageSection>
              ))}
            </div>
          )}
        </DndContext>
      </div>

      {/* Barra de rolagem horizontal externa, fixa na base, sincronizada com o kanban */}
      <div
        ref={proxyRef}
        aria-hidden
        className={cn(
          "pipeline-scroll pointer-events-auto fixed bottom-0 left-0 right-0 z-40 overflow-x-scroll overflow-y-hidden border-t bg-background/95 backdrop-blur",
          !showProxy && "hidden",
        )}
        style={{ height: 16 }}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
    </div>
  );
}


function FieldRow({
  id, label, checked, onChange,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

type StageMetric = {
  count: number;
  avgDays: number;
  totalValue: number;
  convRate: number | null;
  bottleneck: "ok" | "warning" | "critical";
};

function StageColumn({
  stage, count, metrics, children,
}: { stage: Stage; count: number; metrics?: StageMetric; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[270px] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40 transition-colors",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <div className={cn("h-1 w-full", stageColorClass[stage])} />
      <div className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
              {stageLabels[stage]}
            </span>
            {metrics && <BottleneckBadge level={metrics.bottleneck} />}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {count} {count === 1 ? "lead" : "leads"}
          </div>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Adicionar lead"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {metrics && <StageMetricsStrip metrics={metrics} stage={stage} />}
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

function LeadCard({
  id, onOpen, stage, density, stripe, children,
}: {
  id: string; onOpen: () => void; stage: Stage; density: Density; stripe: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  const pad =
    density === "compact" ? "p-2" :
    density === "spacious" ? "p-3.5" : "p-3";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex overflow-hidden rounded-lg border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        isDragging && "opacity-80 shadow-lg",
      )}
    >
      {stripe && (
        <span
          className={cn("absolute inset-y-0 left-0 w-1 z-10", stageColorClass[stage])}
          aria-hidden
        />
      )}
      {/* Conteúdo clicável: não captura gestos de drag, permite rolagem natural */}
      <button
        type="button"
        onClick={(e) => {
          if (isDragging) { e.preventDefault(); return; }
          onOpen();
        }}
        className={cn(
          "min-w-0 flex-1 text-left",
          pad,
          stripe && "pl-3.5",
        )}
      >
        {children}
      </button>
      {/* Handle de arrastar dedicado (única área que inicia drag) */}
      <button
        type="button"
        aria-label="Arrastar card"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex shrink-0 touch-none cursor-grab select-none items-center justify-center border-l border-border/60 bg-muted/30 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing",
          // Maior em mobile para facilitar pegar
          "w-9 md:w-7",
        )}
      >
        <GripVertical className="h-5 w-5 md:h-4 md:w-4" />
      </button>
    </div>
  );
}

function EmptyStage() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
      Sem leads neste estágio
    </div>
  );
}

function StageSection({
  stage, count, metrics, children,
}: { stage: Stage; count: number; metrics?: StageMetric; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        ref={setNodeRef}
        className={cn(
          "overflow-hidden rounded-xl border bg-card transition-colors",
          isOver && "ring-2 ring-primary/50",
        )}
      >
        <div className="flex items-stretch">
          <div className={cn("w-1 shrink-0", stageColorClass[stage])} />
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")}
                />
                <span className="text-sm font-bold uppercase tracking-wide text-foreground">
                  {stageLabels[stage]}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {count}
                </span>
                {metrics && <BottleneckBadge level={metrics.bottleneck} />}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {metrics && metrics.totalValue > 0 && (
                  <span className="hidden md:inline">{formatCurrency(metrics.totalValue)}</span>
                )}
                {metrics && metrics.count > 0 && (
                  <span className="hidden md:inline">{metrics.avgDays.toFixed(1)}d médio</span>
                )}
                {metrics && metrics.convRate !== null && (
                  <span className="hidden md:inline">{metrics.convRate}% conv.</span>
                )}
                <span>{count === 1 ? "1 lead" : `${count} leads`}</span>
              </div>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t bg-muted/20 p-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

type LeadLike = {
  id: string;
  name: string | null;
  phone: string | null;
  interest: string | null;
  temperature: string | null;
  last_interaction_at: string | null;
  credit_value?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  assigned_to?: string | null;
  assigned_member_id?: string | null;
};

function RenderLeadCard({
  lead: l, stage, density, fields, onOpen,
}: {
  lead: LeadLike;
  stage: Stage;
  density: Density;
  fields: CardFields;
  onOpen: () => void;
}) {
  const canViewPhoneFn = useCanViewLeadPhone();
  const canSeePhone = canViewPhoneFn(l as any);
  const interest = fields.interest ? formatInterest(l.interest) : null;
  const phone = fields.phone && canSeePhone ? formatPhone(l.phone) : null;
  const temp = (l.temperature as Temperature | null) ?? null;
  const stageTs = l.updated_at ?? l.created_at ?? l.last_interaction_at;
  const daysInStage = stageTs ? Math.floor((Date.now() - new Date(stageTs).getTime()) / 86_400_000) : null;
  const isHot = temp === "hot";
  const isStuck = daysInStage !== null && daysInStage >= 7 && stage !== "perdido" && stage !== "comprou";
  return (
    <LeadCard id={l.id} onOpen={onOpen} stage={stage} density={density} stripe={fields.stageStripe}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {fields.temperature && temp && (
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", tempDot[temp] ?? "bg-muted-foreground")}
                title={tempLabel[temp]}
                aria-label={tempLabel[temp]}
              />
            )}
            <div className={cn(
              "truncate font-semibold leading-tight text-foreground",
              density === "compact" ? "text-xs" : "text-sm",
            )}>
              {l.name ?? phone ?? (canSeePhone ? l.phone : null) ?? "Sem nome"}
            </div>
            {isHot && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md bg-hot/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-hot">
                <Flame className="h-2.5 w-2.5" /> Quente
              </span>
            )}
          </div>
          {density !== "compact" && l.name && phone && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{phone}</div>
          )}
          {density !== "compact" && l.credit_value ? (
            <div className="mt-1 text-[11px] font-semibold text-foreground/80">
              {formatCurrency(Number(l.credit_value))}
            </div>
          ) : null}
        </div>
      </div>

      {density !== "compact" && interest && (
        <div className="mt-2 inline-flex max-w-full items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80">
          <span className="truncate">{interest}</span>
        </div>
      )}


      {(fields.lastContact || fields.avatar) && density !== "compact" && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
          {fields.lastContact ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{l.last_interaction_at ? timeAgo(l.last_interaction_at) : "Sem contato"}</span>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1.5">
            {daysInStage !== null && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                  isStuck
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : daysInStage >= 3
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-success/30 bg-success/10 text-success",
                )}
                title="Tempo nesta etapa"
              >
                {daysInStage === 0 ? "Hoje" : `${daysInStage}d`}
              </span>
            )}
            <QuickScheduleButton leadId={l.id} leadName={l.name} />
            {fields.avatar && (
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-card",
                  stageColorClass[stage],
                )}
                title={l.name ?? phone ?? ""}
              >
                {initials(l.name, l.phone)}
              </span>
            )}
          </div>
        </div>
      )}
      {!(fields.lastContact || fields.avatar) && density !== "compact" && (
        <div className="mt-3 flex justify-end border-t pt-2">
          <QuickScheduleButton leadId={l.id} leadName={l.name} />
        </div>
      )}
    </LeadCard>
  );
}

// ─── BADGES / STRIPS / OVERVIEW / FUNNEL ─────────────────────────────────────

function BottleneckBadge({ level }: { level: "ok" | "warning" | "critical" }) {
  if (level === "ok") return null;
  const critical = level === "critical";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        critical
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-warning/30 bg-warning/10 text-warning",
      )}
      title={critical ? "Etapa em gargalo crítico" : "Etapa lenta"}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {critical ? "Gargalo" : "Lento"}
    </span>
  );
}

function StageMetricsStrip({ metrics, stage }: { metrics: StageMetric; stage: Stage }) {
  const showConv = metrics.convRate !== null;
  return (
    <div className="grid grid-cols-3 gap-1 border-b bg-muted/30 px-2 py-1.5 text-center">
      <div className="min-w-0">
        <div className="truncate text-[10px] font-bold text-foreground">
          {metrics.totalValue > 0 ? formatCurrency(metrics.totalValue) : "—"}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Valor</div>
      </div>
      <div className="min-w-0">
        <div className={cn(
          "text-[10px] font-bold",
          metrics.bottleneck === "critical" ? "text-destructive"
            : metrics.bottleneck === "warning" ? "text-warning"
            : "text-foreground",
        )}>
          {metrics.count > 0 ? `${metrics.avgDays.toFixed(1)}d` : "—"}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">T. médio</div>
      </div>
      <div className="min-w-0">
        <div className={cn(
          "text-[10px] font-bold",
          showConv && metrics.convRate! >= 50 ? "text-success"
            : showConv && metrics.convRate! >= 20 ? "text-warning"
            : "text-muted-foreground",
        )}>
          {stage === "perdido" || stage === "comprou" || !showConv ? "—" : `${metrics.convRate}%`}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Conversão</div>
      </div>
    </div>
  );
}

function OverviewBar({
  overview,
}: {
  overview: { total: number; totalValue: number; hot: number; stuck: number; won: number };
}) {
  const items = [
    { label: "Total no funil", value: `${overview.total}`, suffix: "leads", icon: Users, tone: "text-primary", bg: "bg-primary/10" },
    { label: "Valor total", value: formatCurrency(overview.totalValue), suffix: "", icon: Wallet, tone: "text-success", bg: "bg-success/10" },
    { label: "Leads quentes", value: `${overview.hot}`, suffix: "leads", icon: Flame, tone: "text-hot", bg: "bg-hot/10" },
    { label: "Parados >7d", value: `${overview.stuck}`, suffix: "leads", icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10" },
    { label: "Vendas fechadas", value: `${overview.won}`, suffix: "cotas", icon: CheckCircle2, tone: "text-success", bg: "bg-success/10" },
  ];
  return (
    <div className="grid h-full w-full min-w-0 max-w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div
            key={it.label}
            className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border bg-card px-2.5 py-2 sm:px-3"
          >
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", it.bg)}>
              <Icon className={cn("h-4 w-4", it.tone)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]">
                {it.label}
              </div>
              <div className="truncate text-sm font-bold text-foreground">
                {it.value}
                {it.suffix && <span className="ml-1 text-[10px] font-medium text-muted-foreground">{it.suffix}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelOverview({
  grouped,
}: {
  grouped: { stage: Stage; leads: unknown[] }[];
}) {
  const active = grouped.filter((g) => g.stage !== "perdido");
  const max = Math.max(1, ...active.map((g) => g.leads.length));
  const start = active[0]?.leads.length ?? 0;
  const won = grouped.find((g) => g.stage === "comprou")?.leads.length ?? 0;
  const totalConv = start > 0 ? ((won / start) * 100).toFixed(1) : "0";
  return (
    <div className="w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">Funil de conversão</div>
            <div className="truncate text-[11px] text-muted-foreground">Taxa por etapa da jornada</div>
          </div>
        </div>
        <div className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success sm:text-[11px]">
          <TrendingUp className="h-3 w-3" />
          <span className="whitespace-nowrap">Conv.: {totalConv}%</span>
        </div>
      </div>

      <div className="flex w-full min-w-0 items-end gap-1">
        {active.map((g, i) => {
          const count = g.leads.length;
          const pct = (count / max) * 100;
          const next = active[i + 1];
          const stepConv = next && count > 0 ? Math.round((next.leads.length / count) * 100) : null;
          return (
            <div key={g.stage} className="flex min-w-0 flex-1 items-end gap-1">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="text-[10px] font-bold text-foreground sm:text-[11px]">{count}</div>
                <div
                  className={cn("w-full rounded-md transition-all", stageColorClass[g.stage])}
                  style={{ height: `${Math.max(8, pct * 0.7)}px`, opacity: 0.85 }}
                />
              </div>
              {stepConv !== null && (
                <div className="hidden self-center rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground md:inline-block">
                  →{stepConv}%
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex w-full min-w-0 gap-1">
        {active.map((g) => (
          <div
            key={g.stage}
            className="min-w-0 flex-1 truncate text-center text-[8px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[9px]"
            title={stageLabels[g.stage]}
          >
            {stageLabels[g.stage]}
          </div>
        ))}
      </div>
    </div>
  );
}
