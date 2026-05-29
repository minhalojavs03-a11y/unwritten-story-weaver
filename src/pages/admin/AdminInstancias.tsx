import { useEffect, useRef, useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Smartphone, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { useAllInstances, useAllTenants } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export default function AdminInstancias() {
  const { data: instances = [] } = useAllInstances();
  const { data: tenants = [] } = useAllTenants();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("https://ipazua.uazapi.com");
  const [instanceToken, setInstanceToken] = useState("");
  const [busy, setBusy] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current || instances.length === 0) return;
    syncedRef.current = true;
    Promise.allSettled(instances.map((i: any) => supabase.functions.invoke("whatsapp-manage", {
      body: { action: "status", tenant_id: i.tenant_id },
    }))).finally(() => qc.invalidateQueries({ queryKey: ["all_instances"] }));
  }, [instances, qc]);

  async function createInstance() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-manage", {
        body: {
          action: "adopt",
          tenant_id: tenantId,
          name: name || `Instância ${instanceToken.slice(0, 6)}`,
          server_url: serverUrl,
          instance_token: instanceToken,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Instância conectada" });
      setOpen(false); setTenantId(""); setName(""); setInstanceToken("");
      qc.invalidateQueries({ queryKey: ["all_instances"] });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  function webhookUrl(instance: any) {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook?secret=${instance.webhook_secret}`;
  }

  return (
    <>
      <AdminHeader title="Instâncias WhatsApp" subtitle="Status de conexão por loja" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Nova instância</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova instância</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Loja</Label>
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Selecione…</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Nome da instância</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vendas Feracon" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
              </div>
              <div className="space-y-1.5"><Label>Server URL (UAZAPI)</Label>
                <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://ipazua.uazapi.com" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
              </div>
              <div className="space-y-1.5"><Label>Token da instância</Label>
                <input value={instanceToken} onChange={(e) => setInstanceToken(e.target.value)} placeholder="e955289c-…" className="h-10 w-full rounded-md border bg-background px-3 text-sm font-mono" />
              </div>
              <Button onClick={createInstance} disabled={busy || !tenantId || !instanceToken || !serverUrl} className="w-full">{busy ? "Conectando…" : "Conectar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      } />
      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-8 lg:grid-cols-3">
        {instances.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma instância ainda.
          </div>
        )}
        {instances.map((i: any) => (
          <div key={i.id} className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${i.is_connected || i.status === "connected" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.tenant?.name ?? "—"}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {i.is_connected || i.status === "connected" ? <CheckCircle2 className="h-3 w-3 text-success" /> : <AlertCircle className="h-3 w-3 text-warning" />}
                  <span className="capitalize">{i.is_connected || i.status === "connected" ? "connected" : i.status}</span>
                  {i.phone_number && <span>· {i.phone_number}</span>}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="font-medium text-muted-foreground">Instância: <span className="font-mono text-foreground">{i.instance_name}</span></div>
              <div className="font-medium text-muted-foreground">Webhook URL (cole no provedor):</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[10px]">{webhookUrl(i)}</code>
                <button className="text-primary hover:opacity-80" onClick={() => { navigator.clipboard.writeText(webhookUrl(i)); toast({ title: "Copiado" }); }}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
