import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const INTERVAL_MS = 15 * 60 * 1000; // 15 min — antes era 5 min (reduz egress)

export function useUpdateLastSeen() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const ping = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await supabase.rpc("touch_my_last_seen");
      } catch {
        /* silencioso — não pode bloquear UI */
      }
    };

    ping();
    const id = window.setInterval(ping, INTERVAL_MS);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);
}
