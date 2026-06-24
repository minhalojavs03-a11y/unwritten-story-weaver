import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, ExternalLink, Calendar as CalendarIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { stageLabels } from "@/data/mock";
import { cn } from "@/lib/utils";
import { useCanViewLeadPhone, displayPhone } from "@/lib/leadPrivacy";
import { useAuth } from "@/contexts/AuthContext";

type LeadRow = {
  sheet_source_label?: string | null;
  id: string;
  name: string | null;
  phone: string | null;
  stage: string | null;
  source: string | null;
  credit_value: number | null;
  created_at: string;
  assigned_at: string | null;
  assigned_member_id: string | null;
  assigned_to: string | null;
  origin: "lead" | "nilton";
};

type MemberRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  role_label: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
};

type PresetKey = "today" | "yesterday" | "week" | "month" | "custom";

// Retorna o instante UTC correspondente à meia-noite (início do dia) em America/Sao_Paulo
// para a data informada (interpretada como data civil em SP).
function spDayStartUTC(year: number, month1to12: number, day: number): Date {
  // SP é UTC-3 (sem horário de verão desde 2019)
  return new Date(Date.UTC(year, month1to12 - 1, day, 3, 0, 0));
}

function nowInSP(): { y: number; m: number; d: number } {
  const now = new Date();
  const spMs = now.getTime() + (now.getTimezoneOffset() - -180) * 60000 * 0; // placeholder
  // Calcula com offset fixo -3h
  const utc = new Date(now.getTime());
  const sp = new Date(utc.getTime() - 3 * 60 * 60 * 1000);
  return { y: sp.getUTCFullYear(), m: sp.getUTCMonth() + 1, d: sp.getUTCDate() };
}

function rangeFromPreset(preset: PresetKey, customStart?: string, customEnd?: string): { start: Date; end: Date; label: string } {
  const { y, m, d } = nowInSP();
  const todayStart = spDayStartUTC(y, m, d);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  if (preset === "today") {
    return { start: todayStart, end: tomorrowStart, label: "Hoje" };
  }
  if (preset === "yesterday") {
    const yStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    return { start: yStart, end: todayStart, label: "Ontem" };
  }
  if (preset === "week") {
    // Últimos 7 dias incluindo hoje
    const start = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start, end: tomorrowStart, label: "Últimos 7 dias" };
  }
  if (preset === "month") {
    const start = spDayStartUTC(y, m, 1);
    return { start, end: tomorrowStart, label: "Este mês" };
  }
  // custom
  if (customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    const start = spDayStartUTC(sy, sm, sd);
    // fim exclusivo = início do dia seguinte ao end
    const endInclusive = spDayStartUTC(ey, em, ed);
    const end = new Date(endInclusive.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, label: `${customStart} → ${customEnd}` };
  }
  return { start: todayStart, end: tomorrowStart, label: "Hoje" };
}

const fmtBRL = (n: number | null | undefined) =>
  n && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";

const fmtHora = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

const todayISO = () => {
  const { y, m, d } = nowInSP();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export default function LeadsHojePage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const canViewPhoneFn = useCanViewLeadPhone();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetKey>("today");
  const [customStart, setCustomStart] = useState<string>(todayISO());
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  const range = useMemo(
    () => rangeFromPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  useEffect(() => {
    let cancelled = false;
    const startISO = range.start.toISOString();
    const endISO = range.end.toISOString();
    (async () => {
      setLoading(true);
      const [leadsRes, niltonRes, membersRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, name, phone, stage, source, credit_value, created_at, assigned_member_at, assigned_member_id, assigned_to, kind")
          .eq("tenant_id", FERACON_TENANT_ID)
          .eq("kind", "lead")
          
          .or(
            `and(assigned_member_at.gte.${startISO},assigned_member_at.lt.${endISO}),` +
            `and(assigned_member_at.is.null,created_at.gte.${startISO},created_at.lt.${endISO})`,
          )
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("nilton_leads")
          .select("id, nome_completo, telefone, status, platform, campaign_name, carta_value, created_time, imported_at, assigned_to")
          .eq("tenant_id", FERACON_TENANT_ID)
          
          .or(
            `and(created_time.gte.${startISO},created_time.lt.${endISO}),` +
            `and(created_time.is.null,imported_at.gte.${startISO},imported_at.lt.${endISO})`,
          )
          .order("created_time", { ascending: false })
          .limit(5000),
        supabase
          .from("tenant_members")
          .select("id, user_id, display_name, role_label, avatar_url, avatar_color, is_active")
          .eq("tenant_id", FERACON_TENANT_ID)
          .eq("is_active", true),
      ]);

      if (cancelled) return;

      const baseLeads: LeadRow[] = (leadsRes.data ?? []).map((l) => ({
        id: l.id,
        name: l.name ?? null,
        phone: l.phone ?? null,
        stage: l.stage ?? null,
        source: l.source ?? null,
        credit_value: l.credit_value as number | null,
        created_at: l.created_at,
        assigned_at: (l as { assigned_member_at?: string | null }).assigned_member_at ?? null,
        assigned_member_id: l.assigned_member_id ?? null,
        assigned_to: l.assigned_to ?? null,
        origin: "lead",
      }));

      const niltonLeads: LeadRow[] = (niltonRes.data ?? []).map((n) => ({
        id: n.id,
        name: n.nome_completo ?? null,
        phone: n.telefone ?? null,
        stage: "novo",
        source: n.platform ? `${n.platform}_ads` : "nilton_planilha",
        credit_value: Number(String(n.carta_value ?? "").replace(/[^\d]/g, "")) || null,
        created_at: n.created_time ?? n.imported_at ?? new Date().toISOString(),
        assigned_at: n.created_time ?? n.imported_at ?? null,
        assigned_member_id: null,
        assigned_to: n.assigned_to ?? null,
        origin: "nilton",
      }));

      setLeads([...baseLeads, ...niltonLeads]);
      setMembers(((membersRes.data ?? []) as Array<{
        id: string; user_id: string | null; display_name: string;
        role_label: string | null; avatar_url: string | null; avatar_color: string | null;
      }>).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        display_name: r.display_name,
        role_label: r.role_label,
        avatar_url: r.avatar_url,
        avatar_color: r.avatar_color,
      })));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberByUserId = useMemo(() => {
    const map = new Map<string, MemberRow>();
    members.forEach((m) => { if (m.user_id) map.set(m.user_id, m); });
    return map;
  }, [members]);

  const groups = useMemo(() => {
    const buckets = new Map<string, { member: MemberRow | null; leads: LeadRow[] }>();
    const keyFor = (l: LeadRow): { key: string; member: MemberRow | null } => {
      const m =
        (l.assigned_member_id && memberById.get(l.assigned_member_id)) ||
        (l.assigned_to && memberByUserId.get(l.assigned_to)) ||
        null;
      return { key: m?.id ?? "__unassigned__", member: m };
    };
    leads.forEach((l) => {
      const { key, member } = keyFor(l);
      const b = buckets.get(key) ?? { member, leads: [] };
      b.leads.push(l);
      buckets.set(key, b);
    });
    return Array.from(buckets.values()).sort((a, b) => {
      if (!a.member) return 1;
      if (!b.member) return -1;
      if (b.leads.length !== a.leads.length) return b.leads.length - a.leads.length;
      return (a.member.display_name || "").localeCompare(b.member.display_name || "");
    });
  }, [leads, memberById, memberByUserId]);

  const total = leads.length;

  const todayRange = useMemo(() => rangeFromPreset("today"), []);
  const [todayTotal, setTodayTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const startISO = todayRange.start.toISOString();
    const endISO = todayRange.end.toISOString();
    (async () => {
      const [leadsRes, niltonRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", FERACON_TENANT_ID)
          .eq("kind", "lead")
          .or(
            `and(assigned_member_at.gte.${startISO},assigned_member_at.lt.${endISO}),` +
            `and(assigned_member_at.is.null,created_at.gte.${startISO},created_at.lt.${endISO})`,
          ),
        supabase
          .from("nilton_leads")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", FERACON_TENANT_ID)
          .or(
            `and(created_time.gte.${startISO},created_time.lt.${endISO}),` +
            `and(created_time.is.null,imported_at.gte.${startISO},imported_at.lt.${endISO})`,
          ),
      ]);
      if (cancelled) return;
      setTodayTotal((leadsRes.count ?? 0) + (niltonRes.count ?? 0));
    })();
    return () => { cancelled = true; };
  }, [todayRange.start, todayRange.end]);

  const presets: { key: PresetKey; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "yesterday", label: "Ontem" },
    { key: "week", label: "7 dias" },
    { key: "month", label: "Este mês" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <>
      <PageHeader
        title={`${range.label}: ${total} ${total === 1 ? "lead" : "leads"}`}
        subtitle={loading ? "Carregando…" : `${total} ${total === 1 ? "lead encontrado" : "leads encontrados"} no período`}
        actions={
          <Link to="/crm" className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Início
          </Link>
        }
      />

      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
          <CalendarIcon className="ml-1 h-4 w-4 text-muted-foreground" />
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                preset === p.key
                  ? "bg-foreground text-background"
                  : "border border-black/10 bg-white text-foreground hover:bg-slate-50",
              )}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">De</label>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs"
              />
              <label className="text-xs text-muted-foreground">até</label>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
          </div>
        )}

        {!loading && total === 0 && (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum lead entrou no período selecionado.
          </div>
        )}

        {!loading && groups.map((g) => {
          const m = g.member;
          const initials = (m?.display_name ?? "S")
            .split(/\s+/)
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <section key={m?.id ?? "unassigned"} className="rounded-2xl border bg-card overflow-hidden">
              <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6 md:py-4">
                {m ? (
                  <Avatar className="h-10 w-10">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback style={{ backgroundColor: m.avatar_color ?? "#1E40AF", color: "white" }}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">
                    {m?.display_name ?? "Sem consultor atribuído"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m?.role_label ?? "Aguardando distribuição"} • {g.leads.length} {g.leads.length === 1 ? "lead" : "leads"}
                  </div>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums text-foreground md:text-2xl">
                  {g.leads.length}
                </div>
              </header>
              <ul className="divide-y">
                {g.leads.map((l) => (
                  <li key={`${l.origin}-${l.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 md:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {l.name?.trim() || (l.phone ? displayPhone(l.phone, canViewPhoneFn(l as any)) : "Sem nome")}
                        </span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                          {l.origin === "nilton" ? "Planilha" : (l.source || "direto")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmtHora(l.assigned_at ?? l.created_at)} • {stageLabels[(l.stage ?? "novo") as keyof typeof stageLabels] ?? l.stage ?? "—"}
                        {l.phone ? ` • ${displayPhone(l.phone, canViewPhoneFn(l as any))}` : ""}
                      </div>
                    </div>
                    <div className="hidden text-right text-sm font-mono tabular-nums text-foreground sm:block">
                      {fmtBRL(l.credit_value)}
                    </div>
                    {l.origin === "lead" && (
                      <Link
                        to={`/conversas?lead=${l.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs text-foreground hover:bg-white"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
