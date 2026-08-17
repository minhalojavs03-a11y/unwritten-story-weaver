import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Trash2, Mail, Shield, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { FERACON_TENANT_ID } from "@/lib/feracon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SuperadminAuthPage() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["superadmin-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("*")
        .eq("tenant_id", FERACON_TENANT_ID)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const createMember = useMutation({
    mutationFn: async () => {
      // In a real app, this would be an edge function to handle auth.users creation
      // For this specific task, we'll try to insert into tenant_members directly 
      // since the user mentioned they are trying to login and it says "many attempts".
      // This suggests the auth user might already exist or they need a tenant_member record.
      
      const { data, error } = await supabase
        .from("tenant_members")
        .insert({
          tenant_id: FERACON_TENANT_ID,
          username: email,
          display_name: displayName,
          role_label: "Consultor",
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Membro criado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["superadmin-members"] });
      setIsCreating(false);
      setEmail("");
      setDisplayName("");
      setPassword("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar membro", description: error.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Autenticação (Superadmin)</h1>
          <p className="text-muted-foreground">Administração manual de membros e autorizações</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo Membro
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members?.map((member) => (
          <Card key={member.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{member.display_name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {member.username}
                  </CardDescription>
                </div>
                <Badge variant={member.is_active ? "default" : "secondary"}>
                  {member.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <UserCog className="h-3 w-3" />
                  {member.role_label}
                </Badge>
                {member.role_label === 'Dono' && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Proprietário
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Membro</DialogTitle>
            <DialogDescription>
              Adicione um novo membro ao tenant Feracon.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input 
                id="name" 
                placeholder="Ex: Luiz Guilherme D. Pinheiro" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (Username)</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="lgdiazpinheiro@gmail.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground italic">
              Nota: Este formulário cria o registro de membro. O usuário ainda precisa de um convite ou conta no Supabase Auth para realizar o login efetivo se o sistema for integrado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancelar</Button>
            <Button onClick={() => createMember.mutate()} disabled={createMember.isPending}>
              {createMember.isPending ? "Criando..." : "Criar Membro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
