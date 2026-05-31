import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, Smartphone, Plus, LogOut, AlertCircle, Trash2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";

type Instance = {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string | null;
  is_connected: boolean;
  qr_code: string | null;
  seller_user_id?: string | null;
  seller_name?: string | null;
  seller_phone?: string | null;
};

const call = async (action: string, extra: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("whatsapp-manage", {
    body: { action, ...extra },
  });
  if (error) {
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

export default function MeuWhatsAppPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmExtra, setConfirmExtra] = useState(false);
  const [phone, setPhone] = useState("");

  const myDisplayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Meu WhatsApp";

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const r = await call("list", { mine_only: true });
      const list: Instance[] = r?.instances ?? [];
      let mine = list.find((i) => i.is_connected || i.status === "connected") ?? list[0] ?? null;
      if (!mine) {
        const created = await call("create", {
          name: myDisplayName,
          seller_user_id: user.id,
          seller_name: myDisplayName,
          confirm_extra: true,
        });
        mine = created?.instance ?? null;
      }
      setInstance(mine);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, myDisplayName]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await call("create", {
        name: myDisplayName,
        seller_user_id: user?.id,
        seller_name: myDisplayName,
        seller_phone: phone.replace(/[^0-9]/g, "") || undefined,
        confirm_extra: confirmExtra,
      });
      setInstance(r?.instance ?? null);
      setShowCreate(false);
      setPhone("");
      setConfirmExtra(false);
      toast({ title: "WhatsApp criado", description: "Escaneie o QR para conectar." });
    } catch (e: any) {
      if (e?.code === "extra_confirmation_required") {
        setConfirmExtra(true);
        toast({ title: "Atenção", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Erro ao criar", description: e?.message, variant: "destructive" });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Meu WhatsApp" subtitle="Conecte o seu número para responder clientes" />

      {loading ? (
        <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
      ) : !instance ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <MyInstance instance={instance} onChanged={load} />
      )}

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setConfirmExtra(false); }}>
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Conectar meu WhatsApp</DialogTitle>
            <DialogDescription>
              Vamos criar um número exclusivo para você. Depois de criado, você escaneia o QR com o celular que vai usar para atender.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Seu nome</Label>
              <Input value={myDisplayName} disabled />
            </div>
            <div>
              <Label>Telefone do vendedor (opcional)</Label>
              <Input
                placeholder="55 11 9 9999 9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
              />
              <p className="mt-1 text-xs text-muted-foreground">Usado para receber notificações sobre o número.</p>
            </div>
            {confirmExtra && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Esta loja já passou do limite gratuito. Adicionar este número terá custo adicional. Clique em criar novamente para confirmar.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmExtra ? "Confirmar com cobrança" : "Criar e gerar QR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12">{children}</div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <Smartphone className="mx-auto h-12 w-12 text-primary" />
      <h2 className="mt-3 font-display text-xl font-bold">Você ainda não conectou seu WhatsApp</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Crie o seu número para começar a atender clientes pelo sistema.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" /> Conectar meu WhatsApp
      </Button>
    </div>
  );
}

function MyInstance({ instance, onChanged }: { instance: Instance; onChanged: () => void }) {
  const [local, setLocal] = useState<Instance>(instance);
  const [qr, setQr] = useState<string | null>(instance.qr_code);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "disconnect" | "delete">(null);
  const [keepHistory, setKeepHistory] = useState(true);
  const justConnectedRef = useRef(local.is_connected);

  useEffect(() => { setLocal(instance); setQr(instance.qr_code); }, [instance]);

  const refreshQr = useCallback(async () => {
    try {
      const r = await call("qrcode", { instance_id: local.id });
      if (typeof r?.qrcode === "string") setQr(r.qrcode);
      if (r?.instance) setLocal(r.instance);
      if (r?.connected && !justConnectedRef.current) {
        justConnectedRef.current = true;
        setQr(null);
        toast({ title: "✅ WhatsApp conectado!" });
        onChanged();
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [local.id, onChanged]);

  // Initial QR + polling while disconnected
  useEffect(() => {
    if (local.is_connected) return;
    refreshQr();
    const id = setInterval(async () => {
      try {
        const r = await call("status", { instance_id: local.id });
        if (r?.instance) setLocal(r.instance);
        if (r?.connected) {
          if (!justConnectedRef.current) {
            justConnectedRef.current = true;
            setQr(null);
            toast({ title: "✅ WhatsApp conectado!" });
            onChanged();
          }
        } else {
          // refresh QR every poll while still disconnected
          refreshQr();
        }
      } catch (e) { console.error(e); }
    }, 15000);
    return () => clearInterval(id);
  }, [local.id, local.is_connected, refreshQr, onChanged]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(confirm);
    try {
      await call(confirm, { instance_id: local.id, keep_history: keepHistory });
      toast({
        title: confirm === "disconnect" ? "Desconectado" : "Removido",
        description: keepHistory
          ? "Histórico de conversas preservado."
          : "Histórico de conversas apagado.",
      });
      setConfirm(null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const openConfirm = (kind: "disconnect" | "delete") => {
    setKeepHistory(true);
    setConfirm(kind);
  };

  const connectedView = local.is_connected ? (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-900/10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-3 font-display text-2xl font-bold text-emerald-900 dark:text-emerald-200">
          WhatsApp Conectado!
        </h2>
        <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-200/80">
          {local.instance_name}{local.phone_number ? ` · ${local.phone_number}` : ""}
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-display text-base font-bold">Gerenciar conexão</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Você pode desconectar para parear outro celular ou remover totalmente o número.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openConfirm("disconnect")} disabled={busy !== null}>
            <LogOut className="mr-2 h-4 w-4" /> Desconectar
          </Button>
          <Button variant="outline" onClick={() => openConfirm("delete")} disabled={busy !== null} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Remover número
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
      <div className="rounded-2xl border bg-card p-6 text-center">
        <Smartphone className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Seu número</p>
        <h2 className="mt-1 font-display text-lg font-bold">{local.instance_name}</h2>
        <div className="mx-auto mt-6 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-3">
          {qrSrc(qr) ? (
            <img src={qrSrc(qr)!} alt="QR Code WhatsApp" className="h-full w-full rounded-lg" />
          ) : qr ? (
            <QRCodeSVG value={qr} size={256} level="M" includeMargin className="h-full w-full rounded-lg" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={refreshQr}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Gerar novo QR
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">Verificando conexão a cada 15s…</p>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-display text-base font-bold">Como vincular</h3>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> Abra o WhatsApp no celular que vai usar para atender</li>
          <li><span className="font-medium text-foreground">2.</span> Toque em <strong>⋮ Configurações → Dispositivos vinculados</strong></li>
          <li><span className="font-medium text-foreground">3.</span> Toque em <strong>"Vincular dispositivo"</strong></li>
          <li><span className="font-medium text-foreground">4.</span> Aponte a câmera para o QR ao lado</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openConfirm("delete")} disabled={busy !== null} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Cancelar este número
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {connectedView}
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "disconnect" ? "Desconectar WhatsApp" : "Remover este número"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "disconnect"
                ? "Você poderá reconectar escaneando um novo QR. Escolha o que fazer com o histórico de conversas deste número."
                : "O número será removido do sistema. Escolha o que fazer com o histórico de conversas deste número."}
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
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy !== null}>Cancelar</Button>
            <Button onClick={runConfirm} disabled={busy !== null} variant={keepHistory ? "default" : "destructive"}>
              {busy !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm === "disconnect" ? "Desconectar" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}