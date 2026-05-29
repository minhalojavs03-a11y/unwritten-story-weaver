import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeamMember, TeamRole } from "@/hooks/useTeam";
import { useUpdateMemberRole, useUpdateMemberProfile } from "@/hooks/useTeam";
import { toast } from "sonner";

interface EditMemberModalProps {
  member: TeamMember | null;
  mode: "role" | "goal" | null;
  onClose: () => void;
}

export function EditMemberModal({ member, mode, onClose }: EditMemberModalProps) {
  const [role, setRole] = useState<TeamRole>((member?.primary_role as TeamRole) ?? "consultant");
  const [roleLabel, setRoleLabel] = useState(member?.role_label ?? "");
  const [goal, setGoal] = useState(String(member?.monthly_goal ?? 0));
  const updRole = useUpdateMemberRole();
  const updProfile = useUpdateMemberProfile();

  // sincroniza quando muda o membro
  if (member && mode === "role" && role !== member.primary_role && !updRole.isPending) {
    // só inicializa uma vez na abertura — feito via key abaixo
  }

  if (!member || !mode) return null;
  const open = !!member && !!mode;

  async function handleSave() {
    if (!member) return;
    try {
      if (mode === "role") {
        await updRole.mutateAsync({ userId: member.id, role });
        await updProfile.mutateAsync({ userId: member.id, role_label: roleLabel });
        toast.success("Cargo atualizado");
      } else {
        await updProfile.mutateAsync({ userId: member.id, monthly_goal: Number(goal) || 0 });
        toast.success("Meta atualizada");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" key={`${member.id}-${mode}`}>
        <DialogHeader>
          <DialogTitle>
            {mode === "role" ? "Alterar cargo" : "Definir meta mensal"} — {member.display_name || member.full_name}
          </DialogTitle>
        </DialogHeader>

        {mode === "role" ? (
          <div className="space-y-4">
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
              <Label htmlFor="label">Rótulo personalizado</Label>
              <Input
                id="label"
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="Ex: Consultor Sênior"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="goal">Meta de leads / cotas no mês</Label>
            <Input
              id="goal"
              type="number"
              min={0}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updRole.isPending || updProfile.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
