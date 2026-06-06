import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FERACON_TENANT_ID, isHiddenFeraconPerson } from "@/lib/feracon";
import { toast } from "@/hooks/use-toast";

type InstanceRow = {
  id: string;
  instance_name: string | null;
  phone_number: string | null;
  is_connected: boolean | null;
  status: string | null;
  seller_user_id: string | null;
  profile?: { id: string; full_name: string | null; email: string | null } | null;
};

function useFeraconInstances() {
  return useQuery({
    queryKey: ["feracon-instances-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id,instance_name,phone_number,is_connected,status,seller_user_id")
        .eq("tenant_id", FERACON_TENANT_ID);
      if (error) throw error;
      const rows = (data ?? []) as InstanceRow[];
      const sellerIds = [...new Set(rows.map((r) => r.seller_user_id).filter(Boolean) as string[])];
      let byId = new Map<string, { id: string; full_name: string | null; email: string | null }>();
      if (sellerIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", sellerIds);
        byId = new Map((profs ?? []).map((p) => [p.id, p]));
      }
      return rows
        .map((r) => ({ ...r, profile: r.seller_user_id ? byId.get(r.seller_user_id) ?? null : null }))
        .filter((r) => !isHiddenFeraconPerson(r.profile ?? {}) && !isHiddenFeraconPerson({ name: r.instance_name }));
    },
  });
}

function consultantName(r: InstanceRow) {
  return (
    r.profile?.full_name ||
    r.profile?.email ||
    r.instance_name ||
    "(sem nome)"
  );
}

export function WhatsAppHealthAlert() {
  const { data: instances = [], isLoading } = useFeraconInstances();
  const [sending, setSending] = useState(false);

  const { connected, disconnected } = useMemo(() => {
    const connected: InstanceRow[] = [];
    const disconnected: InstanceRow[] = [];
    for (const i of instances) {
      const ok = i.is_connected === true || i.status === "connected";
      (ok ? connected : disconnected).push(i);
    }
    return { connected, disconnected };
  }, [instances]);

  if (isLoading || instances.length === 0) return null;
  const hasIssues = disconnected.length > 0;

  async function handleNotify() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-whatsapp-health", {});
      if (error) throw error;
      toast({
        title: "Aviso enviado",
        description: `Mensagem entregue para Ediane, Antonio e cópia para Arley. ${data?.sent ?? ""}`,
      });
    } catch (e: any) {
      toast({
        title: "Falha ao enviar aviso",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className={`rounded-2xl border p-4 md:p-5 ${
        hasIssues
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              hasIssues ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            {hasIssues ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
              {hasIssues
                ? `${disconnected.length} WhatsApp${disconnected.length > 1 ? "s" : ""} desconectado${
                    disconnected.length > 1 ? "s" : ""
                  } na equipe`
                : "Todos os WhatsApp da equipe estão conectados"}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground md:text-sm">
              O CRM da Feracon foi projetado para operar com o WhatsApp de cada consultor conectado
              o tempo todo. Quando um número fica fora do ar, o sistema não consegue receber
              respostas, distribuir leads, registrar conversas, classificar temperatura, disparar
              automações e tampouco notificar a equipe. <strong>Grande parte dos feedbacks de
              "falha no sistema" vem exatamente de instâncias desconectadas</strong> — não de bug
              no software. Reconectar é prioridade máxima.
            </p>
          </div>
        </div>
        {hasIssues && (
          <button
            type="button"
            onClick={handleNotify}
            disabled={sending}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60 md:text-sm"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Avisar Ediane e Antonio
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-rose-500/20 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600">
            <XCircle className="h-3.5 w-3.5" /> Desconectados ({disconnected.length})
          </div>
          {disconnected.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum 🎉</p>
          ) : (
            <ul className="space-y-1.5">
              {disconnected.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{consultantName(i)}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {i.phone_number || "sem número"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conectados ({connected.length})
          </div>
          {connected.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum WhatsApp conectado.</p>
          ) : (
            <ul className="space-y-1.5">
              {connected.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{consultantName(i)}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {i.phone_number || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
