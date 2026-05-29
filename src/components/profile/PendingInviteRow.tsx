import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useResendInvite, useRevokeInvite, buildInviteLink, type Invite } from "@/hooks/useInvites";
import { RoleBadge, type AppRole } from "@/components/ui/RoleBadge";
import { Copy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface PendingInviteRowProps {
  invite: Invite;
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr).getTime();
  const diff = d - Date.now();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `expirou há ${-days}d`;
  if (days === 0) return "expira hoje";
  if (days === 1) return "expira amanhã";
  return `expira em ${days}d`;
}

export function PendingInviteRow({ invite }: PendingInviteRowProps) {
  const revoke = useRevokeInvite();
  const resend = useResendInvite();
  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const isPending = invite.status === "pending" && !expired;

  async function copyLink() {
    await navigator.clipboard.writeText(buildInviteLink(invite.token));
    toast.success("Link copiado");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {invite.display_name || invite.email}
          </p>
          <RoleBadge role={invite.role as AppRole} customLabel={invite.role_label} size="sm" />
          {invite.status === "accepted" && <Badge variant="secondary">Aceito</Badge>}
          {invite.status === "revoked" && <Badge variant="destructive">Revogado</Badge>}
          {isPending && <Badge variant="outline">Pendente</Badge>}
          {expired && invite.status === "pending" && <Badge variant="destructive">Expirado</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {invite.email} · {formatRelative(invite.expires_at)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isPending && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyLink} title="Copiar link">
            <Copy className="h-4 w-4" />
          </Button>
        )}
        {(invite.status === "pending" || invite.status === "revoked") && expired && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => resend.mutate(invite.id)}
            title="Renovar convite"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {isPending && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => revoke.mutate(invite.id)}
            title="Revogar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
