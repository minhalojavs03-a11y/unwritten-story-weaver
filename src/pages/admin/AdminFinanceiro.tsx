import { useEffect, useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { StatCard } from "@/components/oticaflow/StatCard";
import { DollarSign, Building2, AlertTriangle, Save, Loader2 } from "lucide-react";
import { useAllTenants } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type Charge = {
  id: string;
  tenant_id: string;
  whatsapp_instance_id: string;
  seller_name: string | null;
  seller_phone: string | null;
  amount: number;
  currency: string;
  status: string;
  notified_at: string | null;
  created_at: string;
};

type Setting = { tenant_id: string; per_instance_amount: number; currency: string };

function formatBRL(amount: number, currency = "BRL") {
  return Number(amount).toLocaleString("pt-BR", { style: "currency", currency });
}

export default function AdminFinanceiro() {
  const { data: tenants = [] } = useAllTenants();
  const overdue = tenants.filter((t) => t.status === "suspended").length;
  const [charges, setCharges] = useState<Charge[]>([]);
  const [instanceNames, setInstanceNames] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [savingTenant, setSavingTenant] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: chs }, { data: insts }, { data: setts }] = await Promise.all([
        supabase.from("instance_charges").select("*").order("created_at", { ascending: false }),
        supabase.from("whatsapp_instances").select("id, instance_name"),
        supabase.from("billing_settings").select("tenant_id, per_instance_amount, currency"),
      ]);
      setCharges((chs as Charge[]) ?? []);
      const map: Record<string, string> = {};
      (insts ?? []).forEach((i: any) => { map[i.id] = i.instance_name; });
      setInstanceNames(map);
      const sm: Record<string, Setting> = {};
      (setts ?? []).forEach((s: any) => { sm[s.tenant_id] = s; });
      setSettings(sm);
    })();
  }, []);

  async function saveAmount(tenantId: string, amount: number) {
    setSavingTenant(tenantId);
    try {
      const { error } = await supabase
        .from("billing_settings")
        .upsert({ tenant_id: tenantId, per_instance_amount: amount, currency: settings[tenantId]?.currency ?? "BRL" }, { onConflict: "tenant_id" });
      if (error) throw error;
      toast({ title: "Valor atualizado", description: `Novas instâncias serão cobradas em ${formatBRL(amount)}.` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingTenant(null);
    }
  }

  const totalPending = charges.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <AdminHeader title="Financeiro" subtitle="Cobrança por número de WhatsApp" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard to="/admin/clientes" variant="dark" icon={Building2} label="Lojas" value={tenants.length} />
          <StatCard to="/admin/clientes?status=active" variant="dark" icon={DollarSign} label="Ativas" value={tenants.filter((t) => t.status === "active").length} iconColor="bg-[hsl(160_84%_55%/0.15)] text-[hsl(160_84%_65%)]" />
          <StatCard to="/admin/clientes?status=suspended" variant="dark" icon={AlertTriangle} label="Suspensas" value={overdue} iconColor="bg-[hsl(0_84%_60%/0.15)] text-[hsl(0_84%_70%)]" />
          <StatCard to="/admin/financeiro?filter=pending" variant="dark" icon={DollarSign} label="A cobrar" value={formatBRL(totalPending)} iconColor="bg-[hsl(217_91%_60%/0.15)] text-[hsl(217_91%_70%)]" />
        </section>

        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3 md:px-6">
            <h2 className="text-base font-semibold">Valor por instância (por loja)</h2>
            <p className="text-xs text-muted-foreground">Este valor é aplicado a cada novo número de WhatsApp criado pela loja.</p>
          </header>
          <div className="divide-y">
            {tenants.map((t) => {
              const s = settings[t.id];
              const value = s?.per_instance_amount ?? 99;
              return (
                <TenantRow
                  key={t.id}
                  name={t.name}
                  initial={Number(value)}
                  saving={savingTenant === t.id}
                  onSave={(v) => saveAmount(t.id, v)}
                />
              );
            })}
            {tenants.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhuma loja ainda.</p>}
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-3 md:px-6">
            <h2 className="text-base font-semibold">Cobranças por número</h2>
            <p className="text-xs text-muted-foreground">Geradas automaticamente a cada nova instância de WhatsApp.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Loja</th>
                  <th className="px-4 py-2">Número</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Avisado</th>
                  <th className="px-4 py-2">Criado</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => {
                  const tenant = tenants.find((t) => t.id === c.tenant_id);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-2">{tenant?.name ?? "—"}</td>
                      <td className="px-4 py-2">{instanceNames[c.whatsapp_instance_id] ?? "—"}</td>
                      <td className="px-4 py-2">
                        {c.seller_name ?? "—"}
                        {c.seller_phone && <div className="text-xs text-muted-foreground tabular-nums">{c.seller_phone}</div>}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{formatBRL(Number(c.amount), c.currency)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === "paid" ? "bg-success/10 text-success" :
                          c.status === "canceled" ? "bg-muted text-muted-foreground" :
                          "bg-primary/10 text-primary"
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{c.notified_at ? new Date(c.notified_at).toLocaleString("pt-BR") : "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  );
                })}
                {charges.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma cobrança ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function TenantRow({ name, initial, saving, onSave }: { name: string; initial: number; saving: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState<string>(String(initial));
  useEffect(() => { setV(String(initial)); }, [initial]);
  const dirty = Number(v) !== initial;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{name}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">R$</span>
        <Input className="h-9 w-28 tabular-nums" type="number" min={0} step="0.01" value={v} onChange={(e) => setV(e.target.value)} />
        <Button size="sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || saving || isNaN(Number(v))} onClick={() => onSave(Number(v))}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
