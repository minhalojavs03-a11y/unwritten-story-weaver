import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const refreshedRef = useRef<Set<string>>(new Set());

  // Auto-refresh phone_number para instâncias conectadas que ainda estão sem número (ex.: Lucas)
  useEffect(() => {
    const missing = instances.filter(
      (i) => (i.is_connected === true || i.status === "connected") && !i.phone_number,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      let didRefresh = false;
      for (const i of missing) {
        if (refreshedRef.current.has(i.id)) continue;
        refreshedRef.current.add(i.id);
        try {
          await supabase.functions.invoke("whatsapp-manage", {
            body: { action: "status", instance_id: i.id },
          });
          didRefresh = true;
        } catch (e) {
          console.warn("failed to refresh instance phone", i.id, e);
        }
      }
      if (didRefresh && !cancelled) {
        queryClient.invalidateQueries({ queryKey: ["feracon-instances-health"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instances, queryClient]);

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
      className={`rounded-xl border px-3 py-2.5 md:px-4 md:py-3 ${
        hasIssues
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              hasIssues ? "bg-rose-500/15 text-rose-600" : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            {hasIssues ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <h2 className="truncate font-display text-sm font-semibold tracking-tight md:text-base">
            {hasIssues
              ? `${disconnected.length} WhatsApp${disconnected.length > 1 ? "s" : ""} desconectado${
                  disconnected.length > 1 ? "s" : ""
                } · ${connected.length} ok`
              : `Todos os ${connected.length} WhatsApp conectados`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {hasIssues && (
            <details className="group text-xs">
              <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground">
                por que importa?
              </summary>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                O CRM opera com o WhatsApp de cada consultor conectado. Quando um número cai, o sistema
                não recebe respostas, distribui leads ou registra conversas.{" "}
                <strong>Boa parte dos "falha no sistema" é instância desconectada</strong> — reconectar é prioridade.
              </p>
            </details>
          )}
          {hasIssues && (
            <button
              type="button"
              onClick={handleNotify}
              disabled={sending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Avisar Ediane e Antonio
            </button>
          )}
        </div>
      </div>

      {hasIssues && (
        <div className="mt-2.5 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-rose-500/20 bg-background/40 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600">
              <XCircle className="h-3 w-3" /> Desconectados ({disconnected.length})
            </div>
            <ul className="space-y-0.5">
              {disconnected.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{consultantName(i)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {i.phone_number || "sem número"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-background/40 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Conectados ({connected.length})
            </div>
            <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {connected.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{consultantName(i)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {i.phone_number || "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!hasIssues && (
        <div className="mt-2.5 rounded-lg border border-emerald-500/20 bg-background/40 px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Tudo conectado — equipe operando 100%
          </div>
          <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {connected.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{consultantName(i)}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {i.phone_number || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
