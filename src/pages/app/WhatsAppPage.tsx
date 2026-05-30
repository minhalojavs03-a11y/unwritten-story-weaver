import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone, AlertCircle, Loader2, RefreshCw, Trash2, CheckCircle2, PartyPopper, Info, History, Plus, User, Link2, Users } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

type Instance = {
  id: string;
  tenant_id: string;
  instance_name: string;
  phone_number: string | null;
  status: string | null;
  is_connected: boolean;
  last_connection_at: string | null;
  qr_code: string | null;
  seller_user_id?: string | null;
  seller_name?: string | null;
  seller_phone?: string | null;
};

type TenantUser = { id: string; full_name: string | null; email: string | null };
type Seller = {
  id: string;
  name: string;
  phone: string | null;
  user_id: string | null;
  notify_on_new_lead: boolean;
  created_at: string;
};

function qrSrc(qr: string | null): string | null {
  if (!qr) return null;
  const value = qr.trim();
  if (value.startsWith("data:image")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  const compact = value.replace(/\s/g, "");
  const looksLikeImageBase64 =
    compact.length > 200 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact) &&
    (compact.startsWith("iVBOR") || compact.startsWith("/9j/") || compact.startsWith("R0lGOD") || compact.startsWith("PHN2Z"));
  return looksLikeImageBase64 ? `data:image/png;base64,${compact}` : null;
}

const call = async (action: string, extra: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("whatsapp-manage", {
    body: { action, ...extra },
  });
  if (error) {
    // tenta extrair body JSON do erro 402/4xx
    const ctx = (error as any).context;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null);
      if (body) {
        const e: any = new Error(body.message ?? body.error ?? error.message);
        e.code = body.error;
        e.body = body;
        throw e;
      }
    }
    throw new Error(error.message);
  }
  if (data?.error) {
    const e: any = new Error(data.message ?? data.error);
    e.code = data.error;
    e.body = data;
    throw e;
  }
  return data;
};

function InstanceCard({ instance, onChanged, canDestroy = true }: { instance: Instance; onChanged: () => void; canDestroy?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(instance.qr_code);
  const [qrError, setQrError] = useState<string | null>(null);
  const [local, setLocal] = useState<Instance>(instance);
  const wasConnectedRef = useRef(local.is_connected);
  const [justConnected, setJustConnected] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [keepHistory, setKeepHistory] = useState(true);

  useEffect(() => { setLocal(instance); setQrCode(instance.qr_code); setQrError(null); }, [instance]);

  const refreshQr = useCallback(async () => {
    setBusy("qr");
    setQrError(null);
    try {
      const r = await call("qrcode", { instance_id: local.id });
      const q = r?.qrcode;
      if (typeof q === "string") setQrCode(q);
      if (r?.instance) setLocal(r.instance);
      if (r?.connected && !wasConnectedRef.current) {
        wasConnectedRef.current = true;
        setJustConnected(true);
        setQrCode(null);
        toast({ title: "✅ WhatsApp conectado!", description: "Importando histórico de conversas…" });
        call("sync-history", { instance_id: local.id }).catch((e) => console.warn("auto sync-history failed", e));
        onChanged();
      }
    } catch (e: any) {
      console.error(e);
      setQrError(e?.message ?? "Não foi possível gerar o QR Code.");
    } finally {
      setBusy(null);
    }
  }, [local.id, onChanged]);

  useEffect(() => {
    if (local.is_connected) return;
    refreshQr();
    const id = setInterval(async () => {
      try {
        const r = await call("status", { instance_id: local.id });
        if (r?.instance) setLocal(r.instance);
        if (r?.connected && !wasConnectedRef.current) {
          wasConnectedRef.current = true;
          setJustConnected(true);
          setQrCode(null);
          toast({ title: "✅ WhatsApp conectado!", description: "Importando histórico de conversas…" });
          call("sync-history", { instance_id: local.id }).catch((e) => console.warn("auto sync-history failed", e));
          onChanged();
        }
      } catch {}
    }, 2500);
    return () => clearInterval(id);
  }, [local.id, local.is_connected, refreshQr, onChanged]);

  useEffect(() => {
    if (!justConnected) return;
    const t = setTimeout(() => setJustConnected(false), 6000);
    return () => clearTimeout(t);
  }, [justConnected]);

  async function handleReconnect() {
    if (!confirm("Trocar de número?\n\nO WhatsApp atual será desconectado e um novo QR Code será gerado para escanear outro aparelho. O histórico de conversas é preservado.")) return;
    setBusy("reconnect");
    try {
      // Desconecta no provedor preservando histórico. Se falhar por rede, segue mesmo assim.
      try {
        await call("disconnect", { instance_id: local.id, keep_history: true });
      } catch (e: any) {
        console.warn("disconnect step failed, will still try to refresh QR", e?.message);
      }
      wasConnectedRef.current = false;
      setLocal((prev) => ({ ...prev, is_connected: false, status: "connecting", qr_code: null }));
      setQrCode(null);
      // Gera novo QR — re-tenta uma vez em caso de erro de rede transiente
      try {
        await refreshQr();
      } catch {
        await new Promise((r) => setTimeout(r, 600));
        await refreshQr();
      }
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro ao trocar número", description: e.message ?? "Tente novamente.", variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function handleDisconnect() {
    setBusy("disconnect");
    try {
      await call("disconnect", { instance_id: local.id, keep_history: keepHistory });
      wasConnectedRef.current = false;
      toast({
        title: "Número desconectado",
        description: keepHistory ? "Histórico de conversas preservado." : "Histórico de conversas apagado.",
      });
      setShowDisconnect(false);
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function handleSync() {
    setBusy("sync");
    try {
      const r = await call("sync-history", { instance_id: local.id });
      toast({
        title: "Importação iniciada",
        description: r?.message ?? "As conversas vão aparecendo aos poucos no painel.",
      });
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  const qrImage = qrSrc(qrCode);

  if (local.is_connected) {
    return (
      <>
        <section className="client-card rounded-2xl border-success/30 bg-success/5 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="font-display text-lg font-bold tracking-tight text-success">{local.instance_name}</h3>
                <span className="text-xs font-medium uppercase tracking-wide text-success/80">conectado</span>
              </div>
              {local.phone_number && <p className="text-sm tabular-nums text-foreground">{local.phone_number}</p>}
              {(local.seller_name || local.seller_phone) && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Vendedor: <span className="font-medium text-foreground">{local.seller_name ?? "—"}</span>
                  {local.seller_phone && <span className="tabular-nums">· {local.seller_phone}</span>}
                </p>
              )}
              {local.last_connection_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Conectado em {new Date(local.last_connection_at).toLocaleString("pt-BR")}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === "reconnect"} onClick={handleReconnect}>
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === "reconnect" ? "animate-spin" : ""}`} /> Reconectar (trocar número)
                </Button>
                <Button size="sm" variant="outline" disabled={busy === "sync"} onClick={handleSync}>
                  <History className={`mr-1.5 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                  {busy === "sync" ? "Importando…" : "Importar conversas"}
                </Button>
                {canDestroy && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy === "disconnect"} onClick={() => { setKeepHistory(true); setShowDisconnect(true); }}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Desconectar
                  </Button>
                )}
                {!canDestroy && (
                  <span className="self-center text-xs text-muted-foreground">Somente o superadmin pode desconectar a principal — use "Reconectar" para trocar o número.</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <Dialog open={showDisconnect} onOpenChange={(o) => { if (!o) setShowDisconnect(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desconectar número</DialogTitle>
              <DialogDescription>
                O número será desconectado e você poderá reconectar escaneando um novo QR. Escolha o que fazer com o histórico de conversas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setKeepHistory(true)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${keepHistory ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <div className="text-sm font-semibold">Manter histórico de conversas</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  As conversas e mensagens deste número continuam acessíveis para consulta.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setKeepHistory(false)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${!keepHistory ? "border-destructive bg-destructive/5" : "hover:bg-muted/40"}`}
              >
                <div className="text-sm font-semibold text-destructive">Apagar histórico de conversas</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Todas as conversas e mensagens deste número serão removidas. Esta ação não pode ser desfeita.
                </p>
              </button>
            </div>
            <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Independente da sua escolha, <strong>os leads continuam preservados</strong> no <strong>Pipeline</strong> e na <strong>Lista de Clientes</strong>.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDisconnect(false)} disabled={busy === "disconnect"}>Cancelar</Button>
              <Button onClick={handleDisconnect} disabled={busy === "disconnect"} variant={keepHistory ? "default" : "destructive"}>
                {busy === "disconnect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Desconectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <section className="client-card rounded-2xl p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold tracking-tight">{local.instance_name}</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">aguardando QR</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>
      {(local.seller_name || local.seller_phone) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" /> Vendedor: <span className="font-medium text-foreground">{local.seller_name ?? "—"}</span>
          {local.seller_phone && <span className="tabular-nums">· {local.seller_phone}</span>}
        </p>
      )}
      <div className="mt-5 flex flex-col items-center gap-4 md:flex-row md:items-start">
        <div className="rounded-2xl border border-border/60 bg-white p-3 shadow-inner">
          {qrImage ? (
            <img src={qrImage} alt="QR Code WhatsApp" width={220} height={220} className="h-56 w-56" />
          ) : qrCode ? (
            <QRCodeSVG value={qrCode} size={220} level="M" includeMargin className="h-56 w-56" />
          ) : qrError ? (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{qrError}</span>
            </div>
          ) : (
            <div className="flex h-56 w-56 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando QR…
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão automaticamente…
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" style={{ backgroundColor: "#3483fa" }} className="text-white hover:opacity-90" disabled={busy === "qr"} onClick={refreshQr}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${busy === "qr" ? "animate-spin" : ""}`} /> Atualizar QR
            </Button>
          </div>
        </div>
      </div>

      {justConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-background p-8 text-center shadow-2xl animate-in fade-in zoom-in">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper className="h-10 w-10" />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">{local.instance_name} conectado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tudo pronto. Esse número já está atendendo automaticamente.</p>
            <Button className="mt-6 w-full" onClick={() => setJustConnected(false)}>Entendi</Button>
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffectiveRole } from "@/hooks/useEffectiveRole";

export default function WhatsAppPage() {
  const { isSuperadmin } = useEffectiveRole();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdopt, setShowAdopt] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [adoptName, setAdoptName] = useState("");
  const [adoptServerUrl, setAdoptServerUrl] = useState("");
  const [adoptToken, setAdoptToken] = useState("");
  const [adoptSellerName, setAdoptSellerName] = useState("");
  const [adoptSellerPhone, setAdoptSellerPhone] = useState("");
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [showSeller, setShowSeller] = useState(false);
  const [savingSeller, setSavingSeller] = useState(false);
  const [sellerMode, setSellerMode] = useState<"user" | "manual">("manual");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerNotify, setSellerNotify] = useState(true);



  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await call("list");
      let list: Instance[] = r?.instances ?? [];
      // se não tem nenhuma, cria a primeira (Principal)
      if (list.length === 0) {
        const c = await call("get-or-create");
        if (c?.instance) list = [c.instance];
      }
      setInstances(list);
      try {
        const s = await call("list-sellers");
        setSellers(s?.sellers ?? []);
      } catch (e) { console.error("list-sellers failed", e); }
    } catch (e: any) {
      setError(e.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Carrega usuários do tenant
  useEffect(() => {
    (async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      setTenantUsers(profs ?? []);
    })();
  }, []);

  const principalConnected = instances.some((i) => i.is_connected);

  async function handleAddSeller() {
    if (sellerMode === "manual" && sellerName.trim().length < 2) {
      toast({ title: "Informe o nome do vendedor", variant: "destructive" });
      return;
    }
    if (sellerMode === "user" && !sellerUserId) {
      toast({ title: "Selecione um usuário da loja", variant: "destructive" });
      return;
    }
    const payload: Record<string, any> = {
      name: sellerName.trim() || "Vendedor",
      notify_on_new_lead: sellerNotify,
    };
    if (sellerMode === "user") payload.user_id = sellerUserId;
    if (sellerPhone.trim()) payload.phone = sellerPhone.trim();
    setSavingSeller(true);
    try {
      await call("add-seller", payload);
      toast({ title: "Vendedor cadastrado", description: sellerPhone.trim() ? "Avisamos no WhatsApp dele." : "" });
      setShowSeller(false);
      setSellerMode("manual"); setSellerUserId(""); setSellerName(""); setSellerPhone(""); setSellerNotify(true);
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingSeller(false);
    }
  }

  async function handleRemoveSeller(seller: Seller) {
    if (!confirm(`Remover o vendedor "${seller.name}"?`)) return;
    try {
      await call("delete-seller", { seller_id: seller.id });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  async function handleAdopt() {
    const name = adoptName.trim();
    const serverUrl = adoptServerUrl.trim().replace(/\/+$/, "");
    const token = adoptToken.trim();
    if (name.length < 2) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\//i.test(serverUrl)) {
      toast({ title: "Server URL inválida", description: "Ex: https://ipazua.uazapi.com", variant: "destructive" });
      return;
    }
    if (token.length < 10) {
      toast({ title: "Token inválido", variant: "destructive" });
      return;
    }
    setAdopting(true);
    try {
      const payload: Record<string, any> = { name, server_url: serverUrl, instance_token: token };
      if (adoptSellerName.trim()) payload.seller_name = adoptSellerName.trim();
      if (adoptSellerPhone.trim()) payload.seller_phone = adoptSellerPhone.trim();
      const r = await call("adopt", payload);
      toast({
        title: "Instância reintegrada",
        description: r?.connected ? "Já está conectada — sem custo adicional." : "Aguardando conexão. Sem custo adicional.",
      });
      setShowAdopt(false);
      setAdoptName(""); setAdoptServerUrl(""); setAdoptToken("");
      setAdoptSellerName(""); setAdoptSellerPhone("");
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao reintegrar", description: e.message, variant: "destructive" });
    } finally {
      setAdopting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Bot"
        subtitle="Um número principal atende tudo — cadastre vendedores que respondem em nome dele"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => setShowAdopt(true)} className="flex-1 sm:flex-none">
              <Link2 className="mr-1.5 h-4 w-4" /> <span className="truncate">Reintegrar existente</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSeller(true)} disabled={!principalConnected} className="flex-1 sm:flex-none">
              <Plus className="mr-1.5 h-4 w-4" /> <span className="truncate">Adicionar vendedor</span>
            </Button>
            <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-[#25d366]/10 text-[#25d366] sm:flex">
              <Smartphone className="h-5 w-5" />
            </div>
          </div>
        }
      />

      <div className="space-y-4 p-3 md:max-w-4xl md:space-y-6 md:p-8">
        {loading && (
          <div className="client-card flex items-center gap-3 rounded-2xl p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carregando números…</span>
          </div>
        )}

        {error && (
          <div className="client-card rounded-2xl border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Erro ao carregar</h3>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={load}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && instances.map((inst, idx) => (
          <InstanceCard key={inst.id} instance={inst} onChanged={load} canDestroy={isSuperadmin || idx !== 0} />
        ))}

        {!loading && !error && principalConnected && (
          <section className="client-card rounded-2xl p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-bold tracking-tight">Vendedores ({sellers.length})</h3>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowSeller(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Adicionar
              </Button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Todos respondem a partir do número principal da loja. Sem instâncias duplicadas, sem custo extra.
            </p>
            {sellers.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                Nenhum vendedor cadastrado ainda.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border/60">
                {sellers.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.phone ? <span className="tabular-nums">{s.phone}</span> : "sem telefone"}
                        {s.notify_on_new_lead && s.phone ? " · recebe avisos" : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveSeller(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!loading && !error && (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 text-primary" />
              <div className="text-sm">
                <h4 className="font-semibold text-foreground">Como funciona</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>• <strong>Um único número</strong> da loja atende todos os clientes — sem duplicar instâncias.</li>
                  <li>• <strong>Vendedores</strong> são cadastrados aqui e respondem em nome do número principal.</li>
                  <li>• Quem tiver telefone cadastrado recebe avisos de novos leads pelo próprio WhatsApp.</li>
                  <li>• Mensagens enviadas pelo seu próprio número e grupos são ignoradas.</li>
                  <li>• Quando o cliente digitar <strong>"atendente humano"</strong>, o bot daquele número fica em silêncio por 30 minutos.</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>

      <Dialog open={showSeller} onOpenChange={setShowSeller}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Adicionar vendedor</DialogTitle>
            <DialogDescription>O vendedor responde a partir do número principal da loja — sem criar nova instância.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Origem</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={sellerMode === "manual" ? "default" : "outline"} onClick={() => setSellerMode("manual")}>Manual</Button>
                <Button type="button" size="sm" variant={sellerMode === "user" ? "default" : "outline"} onClick={() => setSellerMode("user")} disabled={tenantUsers.length === 0}>
                  Usuário da loja
                </Button>
              </div>
              {sellerMode === "user" && (
                <Select value={sellerUserId} onValueChange={setSellerUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                  <SelectContent>
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.email ?? u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input autoFocus placeholder="Nome do vendedor" value={sellerName} onChange={(e) => setSellerName(e.target.value)} maxLength={80} />
              <Input placeholder="Telefone com DDD (ex: 5511999998888) — opcional" value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} inputMode="tel" />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
              <input type="checkbox" className="mt-0.5" checked={sellerNotify} onChange={(e) => setSellerNotify(e.target.checked)} />
              <span>Avisar o vendedor por WhatsApp quando um novo lead chegar.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSeller(false)} disabled={savingSeller}>Cancelar</Button>
            <Button onClick={handleAddSeller} disabled={savingSeller}>
              {savingSeller ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Adicionar vendedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdopt} onOpenChange={setShowAdopt}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Reintegrar instância existente</DialogTitle>
            <DialogDescription>
              Vincule uma instância já criada na UAZAPI usando o Token e a Server URL. Não gera custo adicional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adopt-name">Nome do número</Label>
              <Input id="adopt-name" placeholder="Ex: Vendas Feracon" value={adoptName} onChange={(e) => setAdoptName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adopt-server">Server URL</Label>
              <Input id="adopt-server" placeholder="https://ipazua.uazapi.com" value={adoptServerUrl} onChange={(e) => setAdoptServerUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adopt-token">Token da Instância</Label>
              <Input id="adopt-token" placeholder="ex: 355264cd-0bcd-..." value={adoptToken} onChange={(e) => setAdoptToken(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input placeholder="Vendedor (opcional)" value={adoptSellerName} onChange={(e) => setAdoptSellerName(e.target.value)} maxLength={80} />
              <Input placeholder="Telefone do vendedor (opcional)" value={adoptSellerPhone} onChange={(e) => setAdoptSellerPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-muted-foreground">
              Reintegração de instância já existente <span className="font-medium text-foreground">não gera cobrança</span>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdopt(false)} disabled={adopting}>Cancelar</Button>
            <Button onClick={handleAdopt} disabled={adopting}>
              {adopting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
              Reintegrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


