import { Users2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTenantMembers } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { FERACON_TENANT_ID } from "@/lib/feracon";

export type DashboardScope = {
  // Mantido por compatibilidade — sempre Feracon. Não há seletor de tenant.
  tenantId: string | null;
  // null = "todos os consultores"; string = consultor específico
  memberId: string | null;
};

interface Props {
  scope: DashboardScope;
  onChange: (next: DashboardScope) => void;
  // Mantido por compatibilidade. Em single-tenant Feracon é ignorado.
  showTenantSelector?: boolean;
}

const ALL = "__all__";

export function DashboardScopeFilter({ scope, onChange }: Props) {
  const { tenantId: authTenantId } = useAuth();
  const focusTenant = authTenantId ?? FERACON_TENANT_ID;
  const { data: members = [] } = useTenantMembers(focusTenant);

  const memberValue = scope.memberId ?? ALL;
  const hasFilter = !!scope.memberId;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Filtrar por consultor
      </span>

      <div className="flex items-center gap-1.5">
        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Select
          value={memberValue}
          onValueChange={(v) =>
            onChange({ tenantId: null, memberId: v === ALL ? null : v })
          }
        >
          <SelectTrigger className="h-8 min-w-[200px] text-xs">
            <SelectValue placeholder="Todos os consultores" />
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

      <GlobalSearch className="w-full min-w-[220px] flex-1 sm:w-auto sm:max-w-sm" />
    </div>
  );
}
