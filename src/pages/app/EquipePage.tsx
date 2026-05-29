import { useMemo, useState } from "react";
import { useTeam, type TeamMember } from "@/hooks/useTeam";
import { useInvites } from "@/hooks/useInvites";
import { usePermissions } from "@/hooks/usePermissions";
import { TeamMemberCard } from "@/components/profile/TeamMemberCard";
import { InviteMemberModal } from "@/components/profile/InviteMemberModal";
import { PendingInviteRow } from "@/components/profile/PendingInviteRow";
import { EditMemberModal } from "@/components/profile/EditMemberModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Search } from "lucide-react";
import { PageHeader } from "./PageHeader";

export default function EquipePage() {
  const { data: team = [], isLoading } = useTeam();
  const { data: invites = [] } = useInvites();
  const { can } = usePermissions();
  const canManage = can("manage_team");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editMode, setEditMode] = useState<"role" | "goal" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter((m) =>
      [m.display_name, m.full_name, m.email, m.role_label]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [team, search]);

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <>
      <PageHeader
        title="Equipe Feracon"
        subtitle={`${team.length} ${team.length === 1 ? "membro" : "membros"} · ${pendingInvites.length} ${pendingInvites.length === 1 ? "convite pendente" : "convites pendentes"}`}
        actions={canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Convidar
          </Button>
        ) : undefined}
      />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">


      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou cargo..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((m) => (
            <TeamMemberCard
              key={m.id}
              member={m}
              canManage={canManage}
              onChangeRole={(mm) => { setEditMember(mm); setEditMode("role"); }}
              onEditGoal={(mm) => { setEditMember(mm); setEditMode("goal"); }}
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Nenhum membro encontrado.
            </p>
          )}
        </div>
      )}

      {canManage && invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Convites</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <PendingInviteRow key={inv.id} invite={inv} />
            ))}
          </div>
        </section>
      )}

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditMemberModal
        member={editMember}
        mode={editMode}
        onClose={() => { setEditMember(null); setEditMode(null); }}
      />
      </div>
    </>
  );
}
