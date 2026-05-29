import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ActiveMember = {
  id: string;
  username: string;
  display_name: string;
  role_label: string | null;
  avatar_color: string | null;
};

interface Ctx {
  member: ActiveMember | null;
  setMember: (m: ActiveMember, opts?: { trustDevice?: boolean }) => void;
  clearMember: () => void;
}

const STORAGE_KEY = "feracon.activeMember";

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;
}

const ActiveMemberCtx = createContext<Ctx>({
  member: null,
  setMember: () => {},
  clearMember: () => {},
});

export function ActiveMemberProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [member, setMemberState] = useState<ActiveMember | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Limpa chave legada sem sufixo de usuário
    localStorage.removeItem(STORAGE_KEY);
    if (!user?.id) {
      setMemberState(null);
      return;
    }
    try {
      const key = storageKey(user.id);
      // localStorage (dispositivo confiável) tem precedência sobre sessionStorage
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      setMemberState(raw ? (JSON.parse(raw) as ActiveMember) : null);
    } catch {
      setMemberState(null);
    }
  }, [user?.id]);

  // Em SIGNED_OUT só limpamos o estado em memória; mantemos o registro no
  // localStorage para que, ao logar novamente com o mesmo usuário (ex.: após
  // expiração de refresh token), a identidade interna seja restaurada sem
  // pedir senha novamente. Limpeza definitiva só via clearMember explícito.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setMemberState(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);


  const setMember = useCallback((m: ActiveMember, opts?: { trustDevice?: boolean }) => {
    const key = storageKey(user?.id);
    const trust = opts?.trustDevice ?? true;
    const payload = JSON.stringify(m);
    if (trust) {
      localStorage.setItem(key, payload);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, payload);
      localStorage.removeItem(key);
    }
    setMemberState(m);
  }, [user?.id]);

  const clearMember = useCallback(() => {
    const key = storageKey(user?.id);
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    setMemberState(null);
  }, [user?.id]);

  return (
    <ActiveMemberCtx.Provider value={{ member, setMember, clearMember }}>{children}</ActiveMemberCtx.Provider>
  );
}

export const useActiveMember = () => useContext(ActiveMemberCtx);
