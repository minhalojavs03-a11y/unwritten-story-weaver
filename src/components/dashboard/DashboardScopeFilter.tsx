import { Users2, Building2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAllTenants, useTenantMembers } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";

export type DashboardScope = {
  // null = "todos os tenants" (apenas superadmin); string = tenant específico
  tenantId: string | null;
  // null = "todos os consultores"; string = consultor específico
  memberId: string | null;
};

interface Props {
  scope: DashboardScope;
  onChange: (next: DashboardScope) => void;
  // Se true, mostra o seletor de tenant (superadmin); senão, só de consultor
  showTenantSelector: boolean;
}

const ALL = "__all__";

export function DashboardScopeFilter({ scope, onChange, showTenantSelector }: Props) {
  const { tenantId: authTenantId } = useAuth();
  const { data: tenants = [] } = useAllTenants();
  // Para listar consultores, precisamos saber qual tenant está em foco.
  // Superadmin: usa o tenant selecionado; outros: usa o auth tenant.
  const focusTenant = showTenantSelector ? scope.tenantId : authTenantId;
  const { data: members = [] } = useTenantMembers(focusTenant ?? null);

  const tenantValue = scope.tenantId ?? ALL;
  const memberValue = scope.memberId ?? ALL;
  const hasFilter = !!scope.tenantId || !!scope.memberId;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Filtrar painel
      </span>

      {showTenantSelector && (
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={tenantValue}
            onValueChange={(v) =>
              onChange({ tenantId: v === ALL ? null : v, memberId: null })
            }
          >
            <SelectTrigger className="h-8 min-w-[180px] text-xs">
              <SelectValue placeholder="Todos os tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Select
          value={memberValue}
          onValueChange={(v) =>
            onChange({ ...scope, memberId: v === ALL ? null : v })
          }
          disabled={showTenantSelector && !scope.tenantId}
        >
          <SelectTrigger className="h-8 min-w-[200px] text-xs">
            <SelectValue
              placeholder={
                showTenantSelector && !scope.tenantId
                  ? "Selecione um tenant primeiro"
                  : "Todos os consultores"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os consultores</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name}
                {m.role_label ? ` · ${m.role_label}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilter && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => onChange({ tenantId: null, memberId: null })}
        >
          <X className="mr-1 h-3 w-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}
