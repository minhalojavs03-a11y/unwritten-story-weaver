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
import { ShieldAlert, Users2, Info, ChevronDown, ChevronUp, Bell, Smartphone, SmartphoneNfc } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { isHiddenFeraconPerson } from "@/lib/feracon";

const CREDIT_MIN = 300_000;
const CREDIT_MAX = 2_000_000;
const CREDIT_STEP = 50_000;

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
  receives_leads_02: boolean | null;
  min_credit_value: number | null;
  max_credit_value: number | null;
  daily_lead_limit: number | null;
  notify_inapp: boolean | null;
  notify_whatsapp: boolean | null;
  phone: string | null;
  receive_leads_when_offline: boolean | null;
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
  const effectiveTenant = authTenantId;

  const distQueryKey = ["lead-distribution-members", isSuperadmin ? "ALL" : effectiveTenant] as const;
  const { data: rows = [], isLoading } = useQuery({
    queryKey: distQueryKey,
    enabled: canAccess && (isSuperadmin || !!effectiveTenant),
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("list_distribution_consultants" as any, {
        _tenant_id: isSuperadmin ? null : effectiveTenant!,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).filter((r) => !isHiddenFeraconPerson(r)).map((r) => ({
        id: r.id ?? null,
        user_id: r.user_id ?? null,
        tenant_id: r.tenant_id,
        display_name: r.display_name ?? null,
        username: r.username ?? null,
        role_label: r.role_label ?? "Consultor",
        avatar_url: r.avatar_url ?? null,
        avatar_color: r.avatar_color ?? null,
        is_active: r.is_active ?? true,
        receives_leads: r.receives_leads ?? false,
        receives_leads_02: r.receives_leads_02 ?? false,
        min_credit_value: r.min_credit_value == null ? CREDIT_MIN : Number(r.min_credit_value),
        max_credit_value: r.max_credit_value == null ? CREDIT_MAX : Number(r.max_credit_value),
        daily_lead_limit: r.daily_lead_limit ?? null,
        notify_inapp: r.notify_inapp ?? true,
        notify_whatsapp: r.notify_whatsapp ?? true,
        phone: r.phone ?? null,
        receive_leads_when_offline: r.receive_leads_when_offline ?? false,
      }));
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

  // Conjunto de user_ids com pelo menos uma instância WhatsApp conectada — regra de fila usa isso.
  const { data: connectedUserIds = new Set<string>() } = useQuery({
    queryKey: ["dist-wa-connected", effectiveTenant],
    enabled: !!effectiveTenant,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("seller_user_id,is_connected,status")
        .eq("tenant_id", effectiveTenant!);
      if (error) throw error;
      const s = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        if (r.seller_user_id && (r.is_connected === true || r.status === "connected")) {
          s.add(r.seller_user_id);
        }
      }
      return s;
    },
    refetchInterval: 30_000,
  });

  // Complementa a lista com a flag `receive_leads_when_offline` (RPC não devolve).
  const { data: offlineFlagMap = {} } = useQuery({
    queryKey: ["dist-offline-flag", effectiveTenant, rows.map((r) => r.id).join(",")],
    enabled: rows.length > 0,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const ids = rows.map((r) => r.id).filter((x): x is string => !!x);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("tenant_members")
        .select("id, receive_leads_when_offline")
        .in("id", ids);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of (data ?? []) as any[]) {
        map[r.id] = r.receive_leads_when_offline === true;
      }
      return map;
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
    if (!r.user_id) {
      toast.error("Consultor sem usuário vinculado. Recrie o vínculo antes de configurar distribuição.");
      return null;
    }
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
    const { error } = await supabase.rpc("update_member_distribution_v2" as any, {
      _member_id: memberId,
      _receives_leads_01: !!next.receives_leads,
      _receives_leads_02: !!next.receives_leads_02,
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
    // Atualiza imediatamente o cache para refletir o estado salvo (id pode ter sido criado agora).
    qc.setQueryData<Row[]>(distQueryKey, (prev) =>
      (prev ?? []).map((row) =>
        rowKey(row) === k
          ? { ...row, ...patch, id: memberId, receives_leads: !!next.receives_leads, receives_leads_02: !!next.receives_leads_02, min_credit_value: minV, max_credit_value: maxV, daily_lead_limit: next.daily_lead_limit ?? null }
          : row,
      ),
    );
    setLocal((s) => { const c = { ...s }; delete c[k]; return c; });
    qc.invalidateQueries({ queryKey: distQueryKey });
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
    qc.setQueryData<Row[]>(distQueryKey, (prev) =>
      (prev ?? []).map((row) =>
        rowKey(row) === k ? { ...row, ...patch, id: memberId } : row,
      ),
    );
    setLocal((s) => { const c = { ...s }; delete c[k]; return c; });
    qc.invalidateQueries({ queryKey: distQueryKey });
  }

  async function saveOfflineFlag(r: Row, value: boolean) {
    const memberId = await ensureMemberId(r);
    if (!memberId) return;
    const { error } = await supabase
      .from("tenant_members")
      .update({ receive_leads_when_offline: value } as any)
      .eq("id", memberId);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success(
      value
        ? "Consultor continua na rotação mesmo com WhatsApp desconectado."
        : "Consultor só recebe leads com WhatsApp conectado.",
    );
    qc.invalidateQueries({ queryKey: ["dist-offline-flag", effectiveTenant] });
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
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A faixa de carta define o intervalo (mínimo e máximo) de valor de carta de crédito que cada consultor pode receber.
            Use os dois puxadores para escolher de R$ 300 mil a R$ 2 milhões. O limite diário pausa novos envios após atingir o número definido.
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
              const receives02 = !!valueOf(r, "receives_leads_02");
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
                        userId={r.user_id ?? r.id ?? name}
                        name={name}
                        avatarUrl={r.avatar_url}
                        avatarColor={r.avatar_color ?? undefined}
                        size={40}
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                          {r.user_id && connectedUserIds.has(r.user_id) ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                              title="WhatsApp conectado — está na fila"
                            >
                              <SmartphoneNfc className="h-3 w-3" /> WA conectado
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                              title="Sem WhatsApp conectado — não recebe leads, fila pula para o próximo"
                            >
                              <Smartphone className="h-3 w-3" /> Sem WA — não recebe
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{r.role_label || "Consultor"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr_120px] md:items-end">
                      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2 md:border-0 md:bg-transparent md:p-0">
                        <Label className="text-xs text-muted-foreground">Recebe leads</Label>
                        <div className="flex flex-col gap-1.5">
                          <div
                            className="flex items-center justify-between gap-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1"
                            title="Leads vindos da planilha principal (Leads 01)"
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Leads 01</span>
                            <Switch
                              checked={receives}
                              onCheckedChange={(v) => saveDistribution(r, { receives_leads: v }, "Recebimento Leads 01")}
                            />
                          </div>
                          <div
                            className="flex items-center justify-between gap-3 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1"
                            title="Leads vindos da nova planilha (Leads 02)"
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Leads 02</span>
                            <Switch
                              checked={receives02}
                              onCheckedChange={(v) => saveDistribution(r, { receives_leads_02: v }, "Recebimento Leads 02")}
                            />
                          </div>
                        </div>
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
                        <select
                          value={dailyLim ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = raw === "" ? null : Math.max(1, Math.min(100, Number(raw)));
                            saveDistribution(r, { daily_lead_limit: next }, "Limite diário");
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">Sem limite</option>
                          {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n} {n === 1 ? "lead/dia" : "leads/dia"}</option>
                          ))}
                        </select>
                      </div>

                    </div>
                  </div>

                  {/* Fallback WhatsApp desconectado */}
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <div className="min-w-0">
                        <Label className="text-xs font-medium text-foreground">📵 Receber leads mesmo com WhatsApp desconectado</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Quando ligado, o consultor continua na rotação mesmo sem WA conectado. O aviso do lead é enviado pelo número da empresa (804) e pelo painel.
                        </p>
                      </div>
                      <Switch
                        checked={r.id ? !!offlineFlagMap[r.id] : false}
                        onCheckedChange={(v) => saveOfflineFlag(r, v)}
                      />
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
                    <Badge variant={receives || receives02 ? "default" : "secondary"} className="font-normal">
                      {receives && receives02
                        ? "Leads 01 + 02"
                        : receives
                          ? "Leads 01"
                          : receives02
                            ? "Leads 02"
                            : "Pausado"}
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
