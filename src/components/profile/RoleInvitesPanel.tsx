import { useState } from "react";
import { useRoleInvites, buildRoleInviteLink, ROLE_LABELS, type RoleInvite } from "@/hooks/useRoleInvites";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, Copy, RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";

export function RoleInvitesPanel() {
  const { data: invites = [], isLoading, regenerate, toggleActive } = useRoleInvites();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Links de convite por cargo</h2>
        <p className="text-xs text-muted-foreground">
          Um link para cada cargo. Qualquer pessoa com o link e uma conta cadastrada entra na equipe com o cargo correspondente.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {invites.map((inv) => (
            <RoleInviteCard
              key={inv.id}
              invite={inv}
              onRegenerate={() => regenerate.mutate(inv.id)}
              onToggle={(v) => toggleActive.mutate({ id: inv.id, is_active: v })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleInviteCard({
  invite,
  onRegenerate,
  onToggle,
}: {
  invite: RoleInvite;
  onRegenerate: () => void;
  onToggle: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = buildRoleInviteLink(invite.token);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{ROLE_LABELS[invite.role]}</span>
          <span className="text-xs text-muted-foreground">· {invite.uses_count} usos</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{invite.is_active ? "Ativo" : "Desativado"}</span>
          <Switch checked={invite.is_active} onCheckedChange={onToggle} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">{link}</code>
        <Button size="sm" variant="outline" onClick={copy} disabled={!invite.is_active}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRegenerate} title="Gerar novo token (invalida o anterior)">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
