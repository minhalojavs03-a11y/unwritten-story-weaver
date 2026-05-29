import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

type Role = "owner" | "supervisor" | "consultor";

export default function AcessosPage() {
  const qc = useQueryClient();
  const { tenantId, user, isOwner } = useAuth();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["tenant-members", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, user_id, role, display_name, created_at, profiles:user_id(email, display_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from("tenant_memberships").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Função atualizada" }); qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Membro removido" }); qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <PageHeader title="Acessos" subtitle="Gerencie quem pode acessar sua conta e com qual função" />
      <div className="space-y-4 p-3 md:p-8">
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Função</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
              {!isLoading && members.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhum membro ainda.</td></tr>}
              {members.map((m: any) => {
                const isSelf = m.user_id === user?.id;
                const canEdit = isOwner && !isSelf;
                return (
                  <tr key={m.id} className="border-t">
                    <td className="px-4 py-3">{m.display_name ?? m.profiles?.display_name ?? "—"} {isSelf && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.profiles?.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <Select value={m.role} onValueChange={(v) => updateRole.mutate({ id: m.id, role: v as Role })}>
                          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Dono</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="consultor">Consultor</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="capitalize">{m.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover este membro?")) removeMember.mutate(m.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
