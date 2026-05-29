import { PageHeader } from "./PageHeader";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardPage() {
  const { displayName, tenantRole } = useAuth();
  return (
    <>
      <PageHeader title={`Olá, ${displayName ?? "bem-vindo"}`} subtitle="Sua nova base está pronta. As próximas features serão construídas em cima do schema novo." />
      <div className="space-y-4 p-3 md:max-w-5xl md:p-8">
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Você está logado como <strong>{tenantRole ?? "—"}</strong>.</p>
          <p className="mt-2 text-sm">Use o menu <strong>Convites</strong> para adicionar membros à sua conta.</p>
        </div>
      </div>
    </>
  );
}
