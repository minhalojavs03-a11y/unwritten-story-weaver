import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, ExternalLink } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { stageLabels } from "@/data/mock";

type LeadRow = {
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

function startOfDaySaoPaulo(): Date {
  const now = new Date();
  // Aproximação: usa fuso local; o RPC do Início também faz por dia local do servidor.
  // Para coerência com a RPC (America/Sao_Paulo), calcula em UTC-3 sem horário de verão.
  const utcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes());
  const sp = new Date(utcMs - 3 * 60 * 60 * 1000);
  const spMid = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
  return spMid;
}

const fmtBRL = (n: number | null | undefined) =>
  n && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";

const fmtHora = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

export default function LeadsHojePage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const start = startOfDaySaoPaulo().toISOString();
    (async () => {
      setLoading(true);
      const [leadsRes, niltonRes, membersRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, name, phone, stage, source, credit_value, created_at, assigned_member_at, assigned_member_id, assigned_to, kind")
          .eq("tenant_id", FERACON_TENANT_ID)
          .eq("kind", "lead")
          .neq("stage", "historico")
          .or(`assigned_member_at.gte.${start},and(assigned_member_at.is.null,created_at.gte.${start})`)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("nilton_leads")
          .select("id, nome_completo, telefone, status, platform, campaign_name, carta_value, created_time, imported_at, assigned_to")
          .eq("tenant_id", FERACON_TENANT_ID)
          .neq("status", "historico")
          .or(`created_time.gte.${start},and(created_time.is.null,imported_at.gte.${start})`)
          .order("created_time", { ascending: false })
          .limit(2000),
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
  }, []);

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

  return (
    <>
      <PageHeader
        title="Leads de hoje"
        subtitle={`Distribuição por consultor • ${total} ${total === 1 ? "lead" : "leads"} hoje`}
        actions={
          <Link to="/crm" className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Início
          </Link>
        }
      />

      <div className="space-y-4 p-4 md:p-8">
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
          </div>
        )}

        {!loading && total === 0 && (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum lead entrou hoje ainda.
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
                    {m?.role_label ?? "Aguardando distribuição"} • {g.leads.length} {g.leads.length === 1 ? "lead" : "leads"} hoje
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
                          {l.name?.trim() || l.phone || "Sem nome"}
                        </span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                          {l.origin === "nilton" ? "Planilha" : (l.source || "direto")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmtHora(l.assigned_at ?? l.created_at)} • {stageLabels[(l.stage ?? "novo") as keyof typeof stageLabels] ?? l.stage ?? "—"}
                        {l.phone ? ` • ${l.phone}` : ""}
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
