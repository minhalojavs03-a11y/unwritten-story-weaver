import { AdminHeader } from "./AdminHeader";
import { useTenantMembers } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { FERACON_TENANT_ID } from "@/lib/feracon";

export default function AdminClientes() {
  const { tenantId } = useAuth();
  const { data: members = [], isLoading } = useTenantMembers(tenantId ?? FERACON_TENANT_ID);

  return (
    <>
      <AdminHeader title="Equipe Feracon" subtitle="Funcionários e papéis" />
      <div className="p-4 md:p-8">
        {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!isLoading && members.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhum funcionário cadastrado.
          </div>
        )}
        {members.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Usuário</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m: any) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold">{m.display_name}</td>
                    <td className="px-4 py-3">{m.role_label ?? "Consultor"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.username ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
