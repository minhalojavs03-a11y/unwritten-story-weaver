import { useState } from "react";
import { Camera, Mail, Phone, Building2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge, type AppRole } from "@/components/ui/RoleBadge";
import { OnlineStatusDot, formatLastSeen } from "@/components/ui/OnlineStatusDot";
import { AvatarUploadModal } from "./AvatarUploadModal";
import type { Profile } from "@/hooks/useProfile";

interface Props {
  profile: Profile;
  role: AppRole;
  tenantName?: string | null;
  editable?: boolean;
  uploadFn?: (blob: Blob) => Promise<unknown>;
  uploadPending?: boolean;
}

export function ProfileHeroCard({ profile, role, tenantName, editable = false, uploadFn, uploadPending }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative z-10 -mt-12 rounded-b-2xl border-x border-b bg-card p-5 shadow-sm md:-mt-20 md:rounded-2xl md:border md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <div className="relative -mt-20 h-32 w-32 shrink-0 self-start md:-mt-16">
          <UserAvatar
            userId={profile.id}
            name={profile.full_name ?? profile.email ?? "?"}
            avatarUrl={profile.avatar_url}
            avatarColor={profile.avatar_color}
            size={128}
            ringClassName="ring-4 ring-card"
          />
          {editable && (
            <button
              onClick={() => setOpen(true)}
              className="absolute bottom-1 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform hover:scale-105"
              aria-label="Alterar foto de perfil"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold leading-tight">
              {profile.full_name ?? profile.email ?? "Sem nome"}
            </h1>
            <RoleBadge role={role} customLabel={profile.role_label} />
          </div>

          {tenantName && (
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {tenantName}
            </div>
          )}

          <div className="mt-2">
            <OnlineStatusDot lastSeenAt={profile.last_seen_at} withLabel />
            {profile.last_seen_at && (
              <span className="ml-2 text-xs text-muted-foreground/70">· {formatLastSeen(profile.last_seen_at)}</span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-3 text-sm text-foreground/80">{profile.bio}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {profile.phone && (
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {profile.phone}</span>
            )}
            {profile.email && (
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {profile.email}</span>
            )}
          </div>
        </div>
      </div>

      {editable && <AvatarUploadModal open={open} onOpenChange={setOpen} uploadFn={uploadFn} isPending={uploadPending} />}
    </section>
  );
}
