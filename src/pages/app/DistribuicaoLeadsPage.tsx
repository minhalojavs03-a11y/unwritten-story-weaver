import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Users2, Info, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const CREDIT_MIN = 300_000;
const CREDIT_MAX = 2_000_000;
const CREDIT_STEP = 50_000;
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

type Row = {
  // id do tenant_members (pode ser null se ainda não existir — criamos sob demanda)
  id: string | null;
  user_id: string | null;
  tenant_id: string;
  display_name: string | null;
  username: string | null;
  role_label: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  is_active: boolean;
  receives_leads: boolean | null;
  min_credit_value: number | null;
  max_credit_value: number | null;
  daily_lead_limit: number | null;
  notify_inapp: boolean | null;
  notify_whatsapp: boolean | null;
  phone: string | null;
};

function rowKey(r: { id: string | null; user_id: string | null }) {
  return r.id ?? `u:${r.user_id}`;
}

function NotificationLog({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dist-notif-log", memberId],
    queryFn: async () => {
      // Combina entradas in-app (app_notifications) e WhatsApp (whatsapp_notification_log)
      const [waRes, inappRes] = await Promise.all([
        supabase
          .from("whatsapp_notification_log" as any)
          .select("id, sent_at, status, error_message, lead:leads(name, credit_value)")
          .eq("consultant_member_id", memberId)
          .order("sent_at", { ascending: false })
          .limit(10),
        supabase
          .from("app_notifications" as any)
          .select("id, created_at, read, lead:leads(name, credit_value), metadata")
          .eq("type", "new_lead")
          .contains("metadata", { consultant_member_id: memberId })
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const wa = ((waRes.data ?? []) as any[]).map((r) => ({
        id: `wa:${r.id}`,
        channel: "WhatsApp" as const,
        when: r.sent_at,
        status: r.status as "sent" | "failed" | "skipped",
        lead: r.lead,
      }));
      const ia = ((inappRes.data ?? []) as any[]).map((r) => ({
        id: `ia:${r.id}`,
        channel: "Painel" as const,
        when: r.created_at,
        status: r.read ? "viewed" : "sent",
        lead: r.lead,
      }));
      return [...wa, ...ia]
        .sort((a, b) => (a.when < b.when ? 1 : -1))
        .slice(0, 10);
    },
  });
  if (isLoading) {
    return <div className="py-2 text-xs text-muted-foreground">Carregando…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="py-2 text-xs text-muted-foreground">Nenhuma notificação recente.</div>;
  }
  const statusBadge = (s: string) => {
    if (s === "sent") return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">✅ Enviado</span>;
    if (s === "failed") return <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">❌ Falhou</span>;
    if (s === "viewed") return <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-400">👁 Visualizado</span>;
    return <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">— {s}</span>;
  };
  return (
    <ul className="divide-y divide-border/60 text-xs">
      {data.map((n: any) => (
        <li key={n.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{n.lead?.name || "(sem nome)"}</p>
            <p className="text-muted-foreground">
              {n.lead?.credit_value != null ? formatCurrency(Number(n.lead.credit_value)) : "—"}
            </p>
          </div>
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{n.channel}</span>
          {statusBadge(n.status)}
          <span className="text-right text-muted-foreground">
            {new Date(n.when).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DistribuicaoLeadsPage() {
  const { tenantId: authTenantId } = useAuth();
  const { isSuperadmin, isOwner } = useEffectiveRole();
  const qc = useQueryClient();

  const canAccess = isSuperadmin || isOwner;
  const { data: tenants = [] } = useAllTenants();
  const [scopeTenantId, setScopeTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (!scopeTenantId && authTenantId) setScopeTenantId(authTenantId);
  }, [authTenantId, scopeTenantId]);
  const effectiveTenant = isSuperadmin ? scopeTenantId : authTenantId;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lead-distribution-members", effectiveTenant],
    enabled: !!effectiveTenant && canAccess,
    queryFn: async (): Promise<Row[]> => {
      // 1) Consultores reais: tenant_memberships com role consultant/attendant + perfil
      const { data: memberships, error: mErr } = await supabase
        .from("tenant_memberships")
        .select("user_id, role")
        .eq("tenant_id", effectiveTenant!)
        .in("role", ["consultant", "attendant"]);
      if (mErr) throw mErr;
      const userIds = (memberships ?? []).map((m: any) => m.user_id);
      if (userIds.length === 0) return [];

      const [profilesRes, distRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, full_name, username, role_label, avatar_url, avatar_color, phone")
          .in("id", userIds),
        supabase
          .from("tenant_members" as any)
          .select(
            "id, user_id, receives_leads, min_credit_value, max_credit_value, daily_lead_limit, notify_inapp, notify_whatsapp, is_active, phone, role_label, display_name, username, avatar_url, avatar_color",
          )
          .eq("tenant_id", effectiveTenant!)
          .in("user_id", userIds),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (distRes.error) throw distRes.error;
      const distByUser = new Map<string, any>();
      for (const d of (distRes.data as any[]) ?? []) {
        if (d.user_id) distByUser.set(d.user_id as string, d);
      }
      const out: Row[] = (profilesRes.data ?? []).map((p: any) => {
        const d = distByUser.get(p.id);
        return {
          id: d?.id ?? null,
          user_id: p.id,
          tenant_id: effectiveTenant!,
          display_name: d?.display_name ?? p.display_name ?? p.full_name ?? null,
          username: d?.username ?? p.username ?? null,
          role_label: d?.role_label ?? p.role_label ?? "Consultor",
          avatar_url: d?.avatar_url ?? p.avatar_url ?? null,
          avatar_color: d?.avatar_color ?? p.avatar_color ?? null,
          is_active: d?.is_active ?? true,
          receives_leads: d?.receives_leads ?? false,
          min_credit_value: d?.min_credit_value ?? null,
          max_credit_value: d?.max_credit_value ?? null,
          daily_lead_limit: d?.daily_lead_limit ?? null,
          notify_inapp: d?.notify_inapp ?? true,
          notify_whatsapp: d?.notify_whatsapp ?? true,
          phone: d?.phone ?? p.phone ?? null,
        };
      });
      out.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
      return out;
    },
  });

  const memberIds = useMemo(
    () => rows.map((r) => r.id).filter((x): x is string => !!x),
    [rows],
  );
  const { data: todayCounts = {} } = useQuery({
    queryKey: ["lead-distribution-today", effectiveTenant, memberIds.join(",")],
    enabled: !!effectiveTenant && memberIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_member_id")
        .eq("tenant_id", effectiveTenant!)
        .eq("kind", "lead")
        .in("assigned_member_id", memberIds)
        .gte("assigned_member_at", since.toISOString());
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        const id = (r as any).assigned_member_id as string | null;
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const [local, setLocal] = useState<Record<string, Partial<Row>>>({});
  useEffect(() => setLocal({}), [rows.length, effectiveTenant]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function valueOf<K extends keyof Row>(r: Row, key: K): Row[K] {
    return (local[rowKey(r)]?.[key] ?? r[key]) as Row[K];
  }

  // Garante a linha em tenant_members; devolve o id.
  async function ensureMemberId(r: Row): Promise<string | null> {
    if (r.id) return r.id;
    const { data, error } = await supabase.rpc("ensure_distribution_member" as any, {
      _tenant_id: r.tenant_id,
      _user_id: r.user_id,
    });
    if (error) {
      toast.error(`Falha ao preparar consultor: ${error.message}`);
      return null;
    }
    return (data as string) ?? null;
  }

  async function saveDistribution(r: Row, patch: Partial<Row>, label: string) {
    const k = rowKey(r);
    setLocal((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
    const next = { ...r, ...local[k], ...patch };
    const minV = next.min_credit_value ?? null;
    const maxV = next.max_credit_value ?? null;
    if (minV != null && maxV != null && Number(minV) > Number(maxV)) {
      toast.error("Valor mínimo não pode ser maior que o máximo.");
      return;
    }
    const memberId = await ensureMemberId(r);
    if (!memberId) return;
    const { error } = await supabase.rpc("update_member_distribution" as any, {
      _member_id: memberId,
      _receives_leads: !!next.receives_leads,
      _min_credit_value: minV,
      _max_credit_value: maxV,
      _daily_lead_limit: next.daily_lead_limit ?? null,
    });
    if (error) {
      toast.error(`Falha ao salvar ${label}: ${error.message}`);
      setLocal((s) => {
        const copy = { ...s };
        delete copy[k];
        return copy;
      });
      return;
    }
    toast.success(`${label} atualizado`);
    qc.invalidateQueries({ queryKey: ["lead-distribution-members", effectiveTenant] });
    qc.invalidateQueries({ queryKey: ["tenant-members", effectiveTenant] });
  }

  async function saveChannels(r: Row, patch: Partial<Pick<Row, "notify_inapp" | "notify_whatsapp">>, label: string) {
    const k = rowKey(r);
    setLocal((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
    const next = { ...r, ...local[k], ...patch };
    const memberId = await ensureMemberId(r);
    if (!memberId) return;
    const { error } = await supabase.rpc("update_member_notification_channels" as any, {
      _member_id: memberId,
      _notify_inapp: !!next.notify_inapp,
      _notify_whatsapp: !!next.notify_whatsapp,
    });
    if (error) {
      toast.error(`Falha ao salvar ${label}: ${error.message}`);
      setLocal((s) => { const c = { ...s }; delete c[k]; return c; });
      return;
    }
    toast.success(`${label} atualizado`);
    qc.invalidateQueries({ queryKey: ["lead-distribution-members", effectiveTenant] });
  }


  if (!canAccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Distribuição de Leads"
        subtitle="Configure quem recebe leads, a faixa de carta de crédito e o limite diário por consultor."
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        {isSuperadmin && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Label className="text-xs text-muted-foreground">Tenant</Label>
            <Select value={scopeTenantId ?? ""} onValueChange={(v) => setScopeTenantId(v || null)}>
              <SelectTrigger className="h-9 w-[280px]">
                <SelectValue placeholder="Selecionar tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A faixa de carta define o intervalo (mínimo e máximo) de valor de carta de crédito que cada consultor pode receber.
            Deixe um lado em branco para "sem limite" naquele lado. O limite diário pausa novos envios após atingir o número definido.
            Alterações salvam automaticamente.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <Users2 className="h-8 w-8" />
            Nenhum consultor cadastrado.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const k = rowKey(r);
              const name = r.display_name || r.username || "Consultor";
              const receives = !!valueOf(r, "receives_leads");
              const minV = valueOf(r, "min_credit_value");
              const maxV = valueOf(r, "max_credit_value");
              const dailyLim = valueOf(r, "daily_lead_limit");
              const todayCount = r.id ? todayCounts[r.id] ?? 0 : 0;
              const overLimit = dailyLim != null && todayCount >= dailyLim;
              const isOpen = !!expanded[k];

              return (
                <div
                  key={k}
                  className="rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm md:p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar
                        userId={r.user_id}
                        name={name}
                        avatarUrl={r.avatar_url}
                        avatarColor={r.avatar_color ?? undefined}
                        size={40}
                      />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.role_label || "Consultor"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr_120px] md:items-end">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-2 md:flex-col md:items-start md:border-0 md:bg-transparent md:p-0">
                        <Label className="text-xs text-muted-foreground">Recebe leads</Label>
                        <Switch
                          checked={receives}
                          onCheckedChange={(v) => saveDistribution(r, { receives_leads: v }, "Status de recebimento")}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Faixa de carta de crédito</Label>
                          <span className="text-xs font-medium text-foreground">
                            {formatCurrency(Number(minV ?? CREDIT_MIN))} — {formatCurrency(Number(maxV ?? CREDIT_MAX))}
                          </span>
                        </div>
                        <Slider
                          min={CREDIT_MIN}
                          max={CREDIT_MAX}
                          step={CREDIT_STEP}
                          value={[
                            Math.max(CREDIT_MIN, Math.min(CREDIT_MAX, Number(minV ?? CREDIT_MIN))),
                            Math.max(CREDIT_MIN, Math.min(CREDIT_MAX, Number(maxV ?? CREDIT_MAX))),
                          ]}
                          onValueChange={(vals) => {
                            const [lo, hi] = vals;
                            setLocal((s) => ({
                              ...s,
                              [k]: { ...s[k], min_credit_value: lo, max_credit_value: hi },
                            }));
                          }}

                          onValueCommit={(vals) => {
                            const [lo, hi] = vals;
                            saveDistribution(
                              r,
                              { min_credit_value: lo, max_credit_value: hi },
                              "Faixa de carta",
                            );
                          }}
                          className="py-2"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{formatCurrency(CREDIT_MIN)}</span>
                          <span>{formatCurrency(CREDIT_MAX)}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Limite diário</Label>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="Sem limite"
                          value={dailyLim ?? ""}
                          onChange={(e) =>
                            setLocal((s) => ({
                              ...s,
                              [k]: {
                                ...s[k],
                                daily_lead_limit: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                              },
                            }))
                          }
                          onBlur={() => {
                            if ((local[k]?.daily_lead_limit ?? null) !== r.daily_lead_limit) {
                              saveDistribution(r, {}, "Limite diário");
                            }
                          }}

                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Canais de aviso */}
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
                      <div className="min-w-0">
                        <Label className="text-xs font-medium text-foreground">🔔 Aviso no painel</Label>
                        <p className="text-[11px] text-muted-foreground">Notificação em tempo real no app.</p>
                      </div>
                      <Switch
                        checked={!!valueOf(r, "notify_inapp")}
                        onCheckedChange={(v) => saveChannels(r, { notify_inapp: v }, "Aviso no painel")}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
                      <div className="min-w-0">
                        <Label className="text-xs font-medium text-foreground">📱 Aviso no WhatsApp</Label>
                        {r.phone ? (
                          <p className="text-[11px] text-muted-foreground">Mensagem direta ao número cadastrado.</p>
                        ) : (
                          <p className="text-[11px] text-amber-600">Número WhatsApp não cadastrado. Cadastre no perfil do consultor.</p>
                        )}
                      </div>
                      <Switch
                        checked={!!valueOf(r, "notify_whatsapp") && !!r.phone}
                        disabled={!r.phone}
                        onCheckedChange={(v) => saveChannels(r, { notify_whatsapp: v }, "Aviso no WhatsApp")}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
                    <Badge variant={receives ? "default" : "secondary"} className="font-normal">
                      {receives ? "Ativo" : "Pausado"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Faixa:{" "}
                      <span className="font-medium text-foreground">
                        {minV != null ? formatCurrency(Number(minV)) : "—"} a {maxV != null ? formatCurrency(Number(maxV)) : "—"}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Hoje:{" "}
                      <span className={overLimit ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                        {todayCount}
                      </span>
                      {dailyLim != null ? ` / ${dailyLim}` : " leads"}
                    </span>
                    {overLimit && (
                      <Badge variant="destructive" className="font-normal">Limite atingido</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 gap-1 px-2 text-xs"
                      onClick={() => setExpanded((s) => ({ ...s, [k]: !s[k] }))}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Notificações
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {isOpen && r.id && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <NotificationLog memberId={r.id} />
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
