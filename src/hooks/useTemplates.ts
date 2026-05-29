import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import type { Tables } from "@/integrations/supabase/types";

export type Template = Tables<"templates">;

export function useTemplates() {
  const { tenantId } = useAuth();
  const { member } = useActiveMember();
  const memberId = member?.id ?? null;
  return useQuery({
    queryKey: ["templates", tenantId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("is_active", true)
        .or(`is_global.eq.true${tenantId ? `,tenant_id.eq.${tenantId}` : ""}`)
        .order("is_global", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const all = (data ?? []) as Template[];
      // Mostra: globais + minhas (created_by_member_id == membro ativo).
      // Mensagens criadas por outros membros do mesmo tenant ficam ocultas.
      return all.filter((t) => {
        if (t.is_global) return true;
        const owner = (t as any).created_by_member_id as string | null | undefined;
        if (!owner) return false; // legado sem dono → não exibe por padrão
        return memberId ? owner === memberId : false;
      });
    },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const { member } = useActiveMember();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string; category?: string | null }) => {
      if (!tenantId) throw new Error("Tenant não identificado");
      if (!member?.id) throw new Error("Selecione sua identidade interna antes de criar mensagens");
      if (input.id) {
        const { error } = await supabase
          .from("templates")
          .update({ title: input.title, body: input.body, category: input.category ?? null })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("templates").insert({
          tenant_id: tenantId,
          title: input.title,
          body: input.body,
          category: input.category ?? null,
          is_global: false,
          is_active: true,
          created_by_member_id: member.id,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function renderTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v ? String(v) : "";
  });
}
