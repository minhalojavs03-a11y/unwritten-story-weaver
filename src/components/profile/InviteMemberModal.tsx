import { useState } from "react";
import { useCreateInvite, buildInviteLink } from "@/hooks/useInvites";
import type { TeamRole } from "@/hooks/useTeam";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberModal({ open, onOpenChange }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<TeamRole>("consultant");
  const [roleLabel, setRoleLabel] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createInvite = useCreateInvite();

  function reset() {
    setEmail("");
    setDisplayName("");
    setRole("consultant");
    setRoleLabel("");
    setInviteLink(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const invite = await createInvite.mutateAsync({
        email,
        role,
        role_label: roleLabel,
        display_name: displayName,
      });
      const link = buildInviteLink(invite.token);
      setInviteLink(link);
      toast.success("Convite criado!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar convite";
      if (msg.includes("duplicate") || msg.includes("uq_team_invites")) {
        toast.error("Já existe um convite pendente para este e-mail");
      } else {
        toast.error(msg);
      }
    }
  }

  async function copy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro para a equipe</DialogTitle>
          <DialogDescription>
            O convite vale por 7 dias. Compartilhe o link gerado com a pessoa convidada.
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail *</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@feracon.com.br"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nome (opcional)</Label>
              <Input
                id="invite-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="João Silva"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Dono da Unidade</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="consultant">Consultor</SelectItem>
                    <SelectItem value="attendant">Atendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-label">Rótulo personalizado</Label>
                <Input
                  id="invite-label"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Ex: Sênior"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {createInvite.isPending ? "Criando..." : "Criar convite"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Link do convite</p>
              <p className="break-all text-xs text-foreground">{inviteLink}</p>
            </div>
            <Button onClick={copy} className="w-full">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar link"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
