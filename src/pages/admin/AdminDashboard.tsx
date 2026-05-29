import { Building2, Smartphone, Users, AlertTriangle } from "lucide-react";
import { AdminHeader } from "./AdminHeader";
import { StatCard } from "@/components/oticaflow/StatCard";
import { useAllTenants, useAllInstances } from "@/hooks/useData";

export default function AdminDashboard() {
  const { data: tenants = [] } = useAllTenants();
  const { data: instances = [] } = useAllInstances();
  const issues = instances.filter((i: any) => i.status !== "connected").length;
  return (
    <>
      <AdminHeader title="Visão geral" subtitle="Saúde de todos os clientes" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard to="/admin/clientes" variant="dark" icon={Building2} label="Lojas cadastradas" value={tenants.length} />
          <StatCard to="/admin/clientes?status=active" variant="dark" icon={Users} label="Lojas ativas" value={tenants.filter((t) => t.status === "active").length} iconColor="bg-[hsl(160_84%_39%/0.15)] text-[hsl(160_84%_55%)]" />
          <StatCard to="/admin/instancias" variant="dark" icon={Smartphone} label="Instâncias WhatsApp" value={instances.length} iconColor="bg-[hsl(38_92%_50%/0.15)] text-[hsl(38_92%_60%)]" />
          <StatCard to="/admin/instancias?status=issue" variant="dark" icon={AlertTriangle} label="Com problema" value={issues} iconColor="bg-[hsl(0_84%_60%/0.15)] text-[hsl(0_84%_68%)]" />
        </section>

        <section className="admin-card overflow-hidden rounded-2xl">
          <div className="border-b border-white/5 px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-white">Lojas</h2>
          </div>
          {tenants.length === 0 && <div className="p-10 text-center text-sm text-white/40">Nenhuma loja cadastrada ainda.</div>}
          <ul className="divide-y divide-white/5">
            {tenants.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.03]">
                <div className={`h-2.5 w-2.5 rounded-full shadow-[0_0_12px] ${t.status === "active" ? "bg-[hsl(160_84%_55%)] shadow-[hsl(160_84%_55%)]" : "bg-white/40 shadow-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{t.name}</div>
                  <div className="text-xs capitalize text-white/50">Plano {t.plan} · {t.status}</div>
                </div>
                <div className="text-xs text-white/40">{new Date(t.created_at).toLocaleDateString("pt-BR")}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
