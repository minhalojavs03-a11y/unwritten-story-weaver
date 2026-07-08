import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Limpa o cache do react-query sempre que o usuário autenticado muda.
 *
 * Sem isso, se um consultor faz logout e outro faz login no mesmo tab
 * (ex.: dois consultores compartilhando o mesmo notebook), o cache em
 * memória — que tem staleTime de 5min e refetchOnMount:false — devolve
 * dados do usuário anterior (leads, conversas etc.) ao novo usuário
 * antes de a query refazer, expondo leads de outro consultor.
 */
export function AuthCacheGuard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const current = user?.id ?? null;
    if (lastUserId.current === undefined) {
      lastUserId.current = current;
      return;
    }
    if (lastUserId.current !== current) {
      qc.clear();
      lastUserId.current = current;
    }
  }, [user?.id, qc]);

  return null;
}
