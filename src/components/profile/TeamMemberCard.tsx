import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge, type AppRole } from "@/components/ui/RoleBadge";
import { OnlineStatusDot } from "@/components/ui/OnlineStatusDot";
import { Button } from "@/components/ui/button";
import type { TeamMember } from "@/hooks/useTeam";
import { MoreVertical, Target, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TeamMemberCardProps {
  member: TeamMember;
  canManage: boolean;
  onChangeRole?: (member: TeamMember) => void;
  onEditGoal?: (member: TeamMember) => void;
}

export function TeamMemberCard({ member, canManage, onChangeRole, onEditGoal }: TeamMemberCardProps) {
  const name = member.display_name || member.full_name || member.email || "Sem nome";
  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="relative">
        <UserAvatar
          userId={member.id}
          name={name}
          avatarUrl={member.avatar_url}
          avatarColor={member.avatar_color}
          size={48}
        />
        <OnlineStatusDot
          lastSeenAt={member.last_seen_at}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <RoleBadge role={member.primary_role as AppRole} customLabel={member.role_label} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> {member.leads_count} leads
          </span>
          {member.monthly_goal > 0 && (
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> meta {member.monthly_goal}
            </span>
          )}
        </div>
      </div>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Gerenciar membro</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChangeRole?.(member)}>Alterar cargo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditGoal?.(member)}>Definir meta mensal</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
