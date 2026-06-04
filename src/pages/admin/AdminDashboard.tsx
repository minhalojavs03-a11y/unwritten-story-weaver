import { Smartphone, Users, AlertTriangle, MessageSquare } from "lucide-react";
import { AdminHeader } from "./AdminHeader";
import { StatCard } from "@/components/oticaflow/StatCard";
import { useAllInstances, useTenantMembers } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { FERACON_TENANT_ID } from "@/lib/feracon";

export default function AdminDashboard() {
  const { tenantId } = useAuth();
  const { data: members = [] } = useTenantMembers(tenantId ?? FERACON_TENANT_ID);
  const { data: instances = [] } = useAllInstances();
  const activeConsultants = members.filter((m: any) => m.is_active !== false).length;
  const issues = instances.filter((i: any) => i.status !== "connected").length;

  return (
    <>
      <AdminHeader title="Visão geral Feracon" subtitle="Painel interno da operação" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard to="/admin/clientes" variant="dark" icon={Users} label="Consultores ativos" value={activeConsultants} iconColor="bg-[hsl(160_84%_39%/0.15)] text-[hsl(160_84%_55%)]" />
          <StatCard to="/conversas" variant="dark" icon={MessageSquare} label="Equipe Feracon" value={members.length} />
          <StatCard to="/admin/instancias" variant="dark" icon={Smartphone} label="Instâncias WhatsApp" value={instances.length} iconColor="bg-[hsl(38_92%_50%/0.15)] text-[hsl(38_92%_60%)]" />
          <StatCard to="/admin/instancias?status=issue" variant="dark" icon={AlertTriangle} label="Com problema" value={issues} iconColor="bg-[hsl(0_84%_60%/0.15)] text-[hsl(0_84%_68%)]" />
        </section>

        <section className="admin-card overflow-hidden rounded-2xl">
          <div className="border-b border-white/5 px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-white">Equipe Feracon</h2>
          </div>
          {members.length === 0 && <div className="p-10 text-center text-sm text-white/40">Nenhum funcionário cadastrado ainda.</div>}
          <ul className="divide-y divide-white/5">
            {members.map((m: any) => (
              <li key={m.id} className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.03]">
                <div className={`h-2.5 w-2.5 rounded-full shadow-[0_0_12px] ${m.is_active !== false ? "bg-[hsl(160_84%_55%)] shadow-[hsl(160_84%_55%)]" : "bg-white/40 shadow-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{m.display_name}</div>
                  <div className="text-xs text-white/50">{m.role_label ?? "Consultor"}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
