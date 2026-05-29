import { useState, useMemo } from "react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRecordings, MEETING_TYPES, useUpdateRecording, useGoogleIntegration, useSyncMeetRecordings } from "@/hooks/useMeetings";
import { toast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { useTenantMembers, useLeads } from "@/hooks/useData";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Play, Video, Search, Star, GraduationCap, Users as UsersIcon,
  Clock, Calendar as CalendarIcon, Sparkles, Filter, ExternalLink, Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatDuration(s?: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function RecordingsPage() {
  const [search, setSearch] = useState("");
  const [consultantFilter, setConsultantFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<string | null>(null);
  const [trainingOnly, setTrainingOnly] = useState(false);
  const [open, setOpen] = useState<any | null>(null);

  const { data: members = [] } = useTenantMembers();
  const { data: leads = [] } = useLeads();
  const googleIntegration = useGoogleIntegration();
  const syncDrive = useSyncMeetRecordings();
  const { data: recordings = [], isLoading } = useRecordings({
    consultantId: consultantFilter,
    meetingType: typeFilter,
    leadId: leadFilter,
    trainingOnly,
    search: search || undefined,
  });
  const update = useUpdateRecording();

  const training = useMemo(() => recordings.filter((r: any) => r.is_training_pick), [recordings]);
  const featured = useMemo(() => recordings.filter((r: any) => r.is_featured && !r.is_training_pick), [recordings]);
  const others = useMemo(() => recordings.filter((r: any) => !r.is_featured && !r.is_training_pick), [recordings]);

  return (
    <>
      <PageHeader
        title="Gravações"
        subtitle="Biblioteca de reuniões gravadas — aprenda com quem mais converte"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                syncDrive.mutate(undefined, {
                  onSuccess: (r) => toast({ title: "Sincronização concluída", description: `${r.inserted} nova(s), ${r.skipped} já existente(s), ${r.scanned} arquivo(s) verificados.` }),
                  onError: (e: any) => toast({ title: "Falha ao sincronizar", description: e?.message ?? "Erro desconhecido", variant: "destructive" }),
                });
              }}
              disabled={syncDrive.isPending}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", syncDrive.isPending && "animate-spin")} />
              {syncDrive.isPending ? "Sincronizando…" : "Sincronizar Drive"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/agenda"><CalendarIcon className="mr-1.5 h-4 w-4" /> Agenda</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-5 p-4 md:p-8">
        {/* Hero / value proposition */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-info/5 to-success/5 p-5 md:p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <GraduationCap className="mr-1 h-3 w-3" /> Academia Feracon
              </Badge>
              <h2 className="mt-2 font-display text-xl font-bold tracking-tight md:text-2xl">
                Assista. Aprenda. Feche mais cotas.
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Toda reunião gravada no Google Meet entra aqui automaticamente. Use os destaques de treinamento para padronizar
                o atendimento da equipe e mostrar aos novatos como os melhores consultores conduzem cada etapa.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <HeroStat label="Gravações" value={recordings.length} />
              <HeroStat label="Treinamento" value={training.length} tone="success" />
              <HeroStat label="Consultores" value={new Set(recordings.map((r: any) => r.consultant_member_id).filter(Boolean)).size} tone="info" />
            </div>
          </div>
        </div>

        {/* Google integration notice */}
        {!googleIntegration.data?.is_connected && (
          <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/5 p-4 sm:flex-row sm:items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
              <Video className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Sincronização automática com Google Meet</div>
              <div className="text-xs text-muted-foreground">
                Quando você conectar uma conta Google com o Meet (com gravação habilitada), todos os vídeos passarão a aparecer aqui automaticamente, vinculados ao lead e ao consultor que conduziu a reunião.
              </div>
            </div>
            <Button size="sm" variant="outline">Adicionar manualmente</Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título…" className="pl-9 h-9" />
          </div>
          <select value={consultantFilter ?? ""} onChange={(e) => setConsultantFilter(e.target.value || null)} className="h-9 rounded-md border bg-background px-2.5 text-sm">
            <option value="">Todos consultores</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          <select value={typeFilter ?? ""} onChange={(e) => setTypeFilter(e.target.value || null)} className="h-9 rounded-md border bg-background px-2.5 text-sm">
            <option value="">Todos os tipos</option>
            {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={leadFilter ?? ""} onChange={(e) => setLeadFilter(e.target.value || null)} className="h-9 rounded-md border bg-background px-2.5 text-sm max-w-[180px]">
            <option value="">Todos os leads</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone}</option>)}
          </select>
          <Button
            size="sm"
            variant={trainingOnly ? "default" : "outline"}
            onClick={() => setTrainingOnly(!trainingOnly)}
          >
            <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
            Apenas treinamento
          </Button>
        </div>

        {/* Training picks */}
        {training.length > 0 && (
          <section>
            <SectionHeader icon={GraduationCap} title="Destaques de treinamento" hint="Curadoria para a equipe" tone="success" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {training.map((r: any) => (
                <RecordingCard key={r.id} recording={r} members={members} onPlay={() => setOpen(r)} highlight="training" onToggle={(patch) => update.mutate({ id: r.id, patch })} />
              ))}
            </div>
          </section>
        )}

        {/* Featured */}
        {featured.length > 0 && (
          <section>
            <SectionHeader icon={Star} title="Destacadas" hint="Reuniões notáveis" tone="warning" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featured.map((r: any) => (
                <RecordingCard key={r.id} recording={r} members={members} onPlay={() => setOpen(r)} highlight="featured" onToggle={(patch) => update.mutate({ id: r.id, patch })} />
              ))}
            </div>
          </section>
        )}

        {/* All */}
        <section>
          <SectionHeader icon={Video} title="Todas as gravações" hint={`${others.length} reunião(ões)`} tone="primary" />
          {isLoading && <div className="rounded-xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>}
          {!isLoading && recordings.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Video className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold">Sua biblioteca está vazia</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Assim que você conectar o Google Meet e gravar uma reunião, ela aparecerá aqui automaticamente, vinculada ao lead e ao consultor responsável.
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline"><Link to="/agenda">Ir para Agenda</Link></Button>
              </div>
            </div>
          )}
          {!isLoading && others.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {others.map((r: any) => (
                <RecordingCard key={r.id} recording={r} members={members} onPlay={() => setOpen(r)} onToggle={(patch) => update.mutate({ id: r.id, patch })} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Player dialog */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{open.title}</DialogTitle>
              </DialogHeader>
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                {open.video_url ? (
                  <video src={open.video_url} controls className="h-full w-full" poster={open.thumbnail_url ?? undefined} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60">
                    <Video className="h-10 w-10" />
                    <p className="text-sm">Vídeo será carregado quando o Google Drive sincronizar.</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {open.description && <p className="text-sm text-muted-foreground">{open.description}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{MEETING_TYPES.find(t => t.value === open.meeting_type)?.label ?? "Reunião"}</Badge>
                  <span><Clock className="mr-1 inline h-3 w-3" />{formatDuration(open.duration_seconds)}</span>
                  <span><CalendarIcon className="mr-1 inline h-3 w-3" />{new Date(open.recorded_at).toLocaleDateString("pt-BR")}</span>
                  {open.lead && <span>Lead: <strong>{open.lead.name ?? open.lead.phone}</strong></span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant={open.is_training_pick ? "default" : "outline"} onClick={() => update.mutate({ id: open.id, patch: { is_training_pick: !open.is_training_pick } })}>
                    <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
                    {open.is_training_pick ? "Remover do treinamento" : "Marcar para treinamento"}
                  </Button>
                  <Button size="sm" variant={open.is_featured ? "default" : "outline"} onClick={() => update.mutate({ id: open.id, patch: { is_featured: !open.is_featured } })}>
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    {open.is_featured ? "Remover destaque" : "Destacar"}
                  </Button>
                  {open.transcript_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={open.transcript_url} target="_blank" rel="noreferrer">Transcrição <ExternalLink className="ml-1 h-3 w-3" /></a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HeroStat({ label, value, tone = "primary" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 px-4 py-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display text-xl font-bold leading-none text-${tone}`}>{value}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, hint, tone }: { icon: typeof Video; title: string; hint: string; tone: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-${tone}/10 text-${tone}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h3 className="font-display text-sm font-bold tracking-tight uppercase">{title}</h3>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function RecordingCard({
  recording: r,
  members,
  onPlay,
  highlight,
  onToggle,
}: {
  recording: any;
  members: any[];
  onPlay: () => void;
  highlight?: "training" | "featured";
  onToggle: (patch: any) => void;
}) {
  const typeInfo = MEETING_TYPES.find((t) => t.value === r.meeting_type) ?? MEETING_TYPES[0];
  const consultant = members.find((m) => m.id === r.consultant_member_id);
  const when = formatDistanceToNow(new Date(r.recorded_at), { addSuffix: true, locale: ptBR });

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all hover:border-primary/40 hover:shadow-lg">
      <button onClick={onPlay} className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted to-muted/50 text-left">
        {r.thumbnail_url ? (
          <img src={r.thumbnail_url} alt={r.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Video className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 fill-current text-primary" />
          </div>
        </div>
        {r.duration_seconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatDuration(r.duration_seconds)}
          </div>
        )}
        {highlight === "training" && (
          <Badge className="absolute left-2 top-2 bg-success text-success-foreground"><GraduationCap className="mr-1 h-2.5 w-2.5" /> Treinamento</Badge>
        )}
        {highlight === "featured" && (
          <Badge className="absolute left-2 top-2 bg-warning text-warning-foreground"><Star className="mr-1 h-2.5 w-2.5 fill-current" /> Destaque</Badge>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug">{r.title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{typeInfo.label}</Badge>
          {r.lead?.name && <span className="truncate text-[11px] text-muted-foreground">com {r.lead.name}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          {consultant ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: consultant.avatar_color ?? "#1E40AF" }} />
              {consultant.display_name}
            </span>
          ) : (
            <span>—</span>
          )}
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> {r.view_count ?? 0}</span>
            <span>{when}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
