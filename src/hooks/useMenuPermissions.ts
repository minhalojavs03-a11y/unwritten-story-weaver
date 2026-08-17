import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MenuRole = "owner" | "supervisor" | "consultant" | "support";

export interface MenuPermission {
  id: string;
  role: MenuRole;
  menu_key: string;
  hidden: boolean;
}

export function useMenuPermissions() {
  return useQuery({
    queryKey: ["menu_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_permissions")
        .select("id, role, menu_key, hidden");
      if (error) throw error;
      return (data ?? []) as MenuPermission[];
    },
    staleTime: 60_000,
  });
}

/** Returns a Set of hidden menu_keys for the given role. */
export function useHiddenMenus(role: MenuRole | null) {
  const { data } = useMenuPermissions();
  const hidden = new Set<string>();
  if (role && data) {
    for (const row of data) {
      if (row.role === role && row.hidden) hidden.add(row.menu_key);
    }
  }
  return hidden;
}

export function useToggleMenuPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { role: MenuRole; menu_key: string; hidden: boolean }) => {
      const { error } = await supabase
        .from("menu_permissions")
        .upsert(
          { role: vars.role, menu_key: vars.menu_key, hidden: vars.hidden },
          { onConflict: "role,menu_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu_permissions"] }),
  });
}
