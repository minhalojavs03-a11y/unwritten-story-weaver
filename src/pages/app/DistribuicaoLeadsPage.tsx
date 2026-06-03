import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { useAllTenants } from "@/hooks/useData";
import { PageHeader } from "./PageHeader";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Users2, Info, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

type Row = {
  id: string;
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

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function isConsultantLike(role: string | null, username: string | null) {
  const v = normalize(`${role ?? ""} ${username ?? ""}`);
  if (/(dono|owner|proprietario)/.test(v)) return false;
  return true;
}

function parseBRL(s: string): number | null {
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
}
function formatBRLInput(v: number | null | undefined): string {
  if (v == null) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function NotificationLog({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dist-notif-log", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notifications")
        .select("id, sent_at, delivered, lead:leads(name, credit_value)")
        .eq("recipient_member_id", memberId)
        .order("sent_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) {
    return <div className="py-2 text-xs text-muted-foreground">Carregando…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="py-2 text-xs text-muted-foreground">Nenhuma notificação recente.</div>;
  }
  return (
    <ul className="divide-y divide-border/60 text-xs">
      {data.map((n: any) => (
        <li key={n.id} className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{n.lead?.name || "(sem nome)"}</p>
            <p className="text-muted-foreground">
              {n.lead?.credit_value != null ? formatCurrency(Number(n.lead.credit_value)) : "—"}
            </p>
          </div>
          <div className="text-right text-muted-foreground">
            <div>{new Date(n.sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
            <div className={n.delivered ? "text-emerald-600" : "text-amber-600"}>
              {n.delivered ? "Enviada" : "Falhou"}
            </div>
          </div>
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
      const { data, error } = await supabase
        .from("tenant_members")
        .select(
          "id,tenant_id,display_name,username,role_label,avatar_url,avatar_color,is_active,receives_leads,min_credit_value,max_credit_value,daily_lead_limit" as any,
        )
        .eq("tenant_id", effectiveTenant!)
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).filter((r) => isConsultantLike(r.role_label, r.username)) as Row[];
    },
  });

  const memberIds = useMemo(() => rows.map((r) => r.id), [rows]);
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
    return (local[r.id]?.[key] ?? r[key]) as Row[K];
  }

  async function saveDistribution(r: Row, patch: Partial<Row>, label: string) {
    setLocal((s) => ({ ...s, [r.id]: { ...s[r.id], ...patch } }));
    const next = { ...r, ...local[r.id], ...patch };
    const minV = next.min_credit_value ?? null;
    const maxV = next.max_credit_value ?? null;
    if (minV != null && maxV != null && Number(minV) > Number(maxV)) {
      toast.error("Valor mínimo não pode ser maior que o máximo.");
      return;
    }
    const { error } = await supabase.rpc("update_member_distribution" as any, {
      _member_id: r.id,
      _receives_leads: !!next.receives_leads,
      _min_credit_value: minV,
      _max_credit_value: maxV,
      _daily_lead_limit: next.daily_lead_limit ?? null,
    });
    if (error) {
      toast.error(`Falha ao salvar ${label}: ${error.message}`);
      setLocal((s) => {
        const copy = { ...s };
        delete copy[r.id];
        return copy;
      });
      return;
    }
    toast.success(`${label} atualizado`);
    qc.invalidateQueries({ queryKey: ["lead-distribution-members", effectiveTenant] });
    qc.invalidateQueries({ queryKey: ["tenant-members", effectiveTenant] });
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
              const name = r.display_name || r.username || "Consultor";
              const receives = !!valueOf(r, "receives_leads");
              const minV = valueOf(r, "min_credit_value");
              const maxV = valueOf(r, "max_credit_value");
              const dailyLim = valueOf(r, "daily_lead_limit");
              const todayCount = todayCounts[r.id] ?? 0;
              const overLimit = dailyLim != null && todayCount >= dailyLim;
              const isOpen = !!expanded[r.id];

              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm md:p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar
                        userId={r.id}
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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_160px_160px_120px] md:items-end">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-2 md:flex-col md:items-start md:border-0 md:bg-transparent md:p-0">
                        <Label className="text-xs text-muted-foreground">Recebe leads</Label>
                        <Switch
                          checked={receives}
                          onCheckedChange={(v) => saveDistribution(r, { receives_leads: v }, "Status de recebimento")}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Valor mínimo (R$)</Label>
                        <Input
                          inputMode="numeric"
                          placeholder="Sem mínimo"
                          value={formatBRLInput(minV)}
                          onChange={(e) =>
                            setLocal((s) => ({
                              ...s,
                              [r.id]: { ...s[r.id], min_credit_value: parseBRL(e.target.value) },
                            }))
                          }
                          onBlur={() => {
                            if ((local[r.id]?.min_credit_value ?? null) !== r.min_credit_value) {
                              saveDistribution(r, {}, "Valor mínimo da carta");
                            }
                          }}
                          className="h-9"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Valor máximo (R$)</Label>
                        <Input
                          inputMode="numeric"
                          placeholder="Sem máximo"
                          value={formatBRLInput(maxV)}
                          onChange={(e) =>
                            setLocal((s) => ({
                              ...s,
                              [r.id]: { ...s[r.id], max_credit_value: parseBRL(e.target.value) },
                            }))
                          }
                          onBlur={() => {
                            if ((local[r.id]?.max_credit_value ?? null) !== r.max_credit_value) {
                              saveDistribution(r, {}, "Valor máximo da carta");
                            }
                          }}
                          className="h-9"
                        />
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
                              [r.id]: {
                                ...s[r.id],
                                daily_lead_limit: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                              },
                            }))
                          }
                          onBlur={() => {
                            if ((local[r.id]?.daily_lead_limit ?? null) !== r.daily_lead_limit) {
                              saveDistribution(r, {}, "Limite diário");
                            }
                          }}
                          className="h-9"
                        />
                      </div>
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
                      onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Notificações
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {isOpen && (
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
