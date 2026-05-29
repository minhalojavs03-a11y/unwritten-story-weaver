import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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
import { ShieldAlert, Users2, Info } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/leadTier";

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
  max_credit_value: number | null;
  daily_lead_limit: number | null;
};

const TIER_OPTIONS = [
  { value: "none", label: "Sem faixa (não recebe por tier)" },
  { value: "500000", label: `Até ${formatBRL(500_000)}` },
  { value: "800000", label: `Até ${formatBRL(800_000)}` },
  { value: "2000000", label: `Até ${formatBRL(2_000_000)}` },
];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function isConsultantLike(role: string | null, username: string | null) {
  const v = normalize(`${role ?? ""} ${username ?? ""}`);
  if (/(dono|owner|proprietario)/.test(v)) return false;
  return true;
}

export default function DistribuicaoLeadsPage() {
  const { tenantId } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canView = can("view_team_metrics");
  const canManage = can("manage_team") || can("view_team_metrics");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lead-distribution-members", tenantId],
    enabled: !!tenantId && canView,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select(
          "id,tenant_id,display_name,username,role_label,avatar_url,avatar_color,is_active,receives_leads,max_credit_value,daily_lead_limit",
        )
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((r) => isConsultantLike(r.role_label, r.username)) as Row[];
    },
  });

  // Conta leads recebidos hoje por membro
  const memberIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: todayCounts = {} } = useQuery({
    queryKey: ["lead-distribution-today", tenantId, memberIds.join(",")],
    enabled: !!tenantId && memberIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_member_id")
        .eq("tenant_id", tenantId!)
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

  // estado local otimista
  const [local, setLocal] = useState<Record<string, Partial<Row>>>({});
  useEffect(() => setLocal({}), [rows.length]);

  function valueOf<K extends keyof Row>(r: Row, key: K): Row[K] {
    return (local[r.id]?.[key] ?? r[key]) as Row[K];
  }

  async function patchMember(id: string, patch: Partial<Row>, label: string) {
    setLocal((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    const { error } = await supabase.from("tenant_members").update(patch as never).eq("id", id);
    if (error) {
      toast.error(`Falha ao salvar ${label}: ${error.message}`);
      setLocal((s) => {
        const copy = { ...s };
        delete copy[id];
        return copy;
      });
      return;
    }
    toast.success(`${label} atualizado`);
    qc.invalidateQueries({ queryKey: ["lead-distribution-members", tenantId] });
    qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] });
  }

  if (!canView) {
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
        subtitle="Defina quem recebe leads, em qual faixa de crédito e o limite diário por consultor."
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ao desativar um consultor, ele para de receber novos leads automáticos imediatamente.
            A faixa de crédito define o teto que cada um pode atender. O limite diário pausa novos
            envios para o consultor após atingir o número definido (deixe vazio para sem limite).
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
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
              const tierVal = valueOf(r, "max_credit_value");
              const dailyLim = valueOf(r, "daily_lead_limit");
              const todayCount = todayCounts[r.id] ?? 0;
              const overLimit = dailyLim != null && todayCount >= dailyLim;

              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm md:p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                    {/* Identidade */}
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
                        <p className="truncate text-xs text-muted-foreground">
                          {r.role_label || "Consultor"}
                        </p>
                      </div>
                    </div>

                    {/* Controles */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_220px_160px] md:items-end">
                      {/* Toggle */}
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-2 md:flex-col md:items-start md:justify-start md:border-0 md:bg-transparent md:p-0">
                        <Label className="text-xs text-muted-foreground">Recebe leads</Label>
                        <Switch
                          checked={receives}
                          disabled={!canManage}
                          onCheckedChange={(v) =>
                            patchMember(r.id, { receives_leads: v }, "Status de recebimento")
                          }
                        />
                      </div>

                      {/* Faixa */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Faixa de crédito</Label>
                        <Select
                          disabled={!canManage}
                          value={tierVal == null ? "none" : String(tierVal)}
                          onValueChange={(v) =>
                            patchMember(
                              r.id,
                              { max_credit_value: v === "none" ? null : Number(v) },
                              "Faixa de crédito",
                            )
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIER_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Limite diário */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Limite diário
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="Sem limite"
                          disabled={!canManage}
                          value={dailyLim ?? ""}
                          onChange={(e) =>
                            setLocal((s) => ({
                              ...s,
                              [r.id]: {
                                ...s[r.id],
                                daily_lead_limit:
                                  e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                              },
                            }))
                          }
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const newVal = raw === "" ? null : Math.max(0, Number(raw));
                            if (newVal !== r.daily_lead_limit) {
                              patchMember(r.id, { daily_lead_limit: newVal }, "Limite diário");
                            }
                          }}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Footer status */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
                    <Badge variant={receives ? "default" : "secondary"} className="font-normal">
                      {receives ? "Ativo" : "Pausado"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Hoje:{" "}
                      <span
                        className={
                          overLimit
                            ? "font-semibold text-destructive"
                            : "font-semibold text-foreground"
                        }
                      >
                        {todayCount}
                      </span>
                      {dailyLim != null ? ` / ${dailyLim}` : " leads"}
                    </span>
                    {overLimit && (
                      <Badge variant="destructive" className="font-normal">
                        Limite atingido
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
