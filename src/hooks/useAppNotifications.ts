import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { toast } from "sonner";

export type AppNotification = {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  type: string;
  title: string;
  body: string;
  lead_id: string | null;
  read: boolean;
  created_at: string;
};

function hrefFor(n: AppNotification): string {
  if (n.lead_id) return `/conversas?lead=${n.lead_id}`;
  return "/conversas";
}

// Small in-browser beep so we don't need to ship an audio asset.
function playBeep() {
  try {
    const w: any = window;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch { /* noop */ }
}

export function useAppNotifications() {
  const { user } = useAuth();
  const effective = useEffectiveUser();
  // Em modo suporte, lê as notificações do alvo (Micaelly), não do superadmin.
  const userId = (effective.isImpersonating ? effective.id : user?.id) ?? null;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("app_notifications" as any)
        .select("id, tenant_id, recipient_user_id, type, title, body, lead_id, read, created_at")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      setItems((data ?? []) as unknown as AppNotification[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`app-notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications", filter: `recipient_user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setItems((prev) => {
            if (prev.some((i) => i.id === n.id)) return prev;
            return [n, ...prev].slice(0, 30);
          });
          // Toast popup
          toast(n.title, {
            description: n.body,
            duration: 8000,
            action: n.lead_id
              ? { label: "Ver lead", onClick: () => { window.location.href = hrefFor(n); } }
              : undefined,
          });
          playBeep();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_notifications", filter: `recipient_user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, ...n } : i)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = items.filter((i) => !i.read).length;

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase
      .from("app_notifications" as any)
      .update({ read: true })
      .in("id", unreadIds);
  }, [userId, items]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    await supabase.from("app_notifications" as any).update({ read: true }).eq("id", id);
  }, []);

  const approveTakeover = useCallback(async (notif: AppNotification) => {
    if (!notif.lead_id) return;
    // Encontra a request pendente para esse lead em que sou o dono.
    const { data: req } = await supabase
      .from("lead_takeover_requests" as any)
      .select("id")
      .eq("lead_id", notif.lead_id)
      .eq("owner_user_id", userId as string)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const reqId = (req as any)?.id;
    if (!reqId) {
      toast.error("Pedido não encontrado ou já respondido.");
      return;
    }
    const { error } = await supabase.rpc("approve_lead_takeover" as any, { _request_id: reqId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Atendimento liberado para o supervisor.");
    await supabase.from("app_notifications" as any).update({ read: true }).eq("id", notif.id);
    setItems((prev) => prev.map((i) => (i.id === notif.id ? { ...i, read: true } : i)));
  }, [userId]);

  const denyTakeover = useCallback(async (notif: AppNotification) => {
    if (!notif.lead_id) return;
    const { data: req } = await supabase
      .from("lead_takeover_requests" as any)
      .select("id")
      .eq("lead_id", notif.lead_id)
      .eq("owner_user_id", userId as string)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const reqId = (req as any)?.id;
    if (!reqId) {
      toast.error("Pedido não encontrado ou já respondido.");
      return;
    }
    const { error } = await supabase.rpc("deny_lead_takeover" as any, { _request_id: reqId });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pedido recusado.");
    await supabase.from("app_notifications" as any).update({ read: true }).eq("id", notif.id);
    setItems((prev) => prev.map((i) => (i.id === notif.id ? { ...i, read: true } : i)));
  }, [userId]);

  return { items, unreadCount, loading, markAllRead, markRead, hrefFor, approveTakeover, denyTakeover };
}
