import { useMyProfile } from "@/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useMyTenant } from "@/hooks/useData";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import {
  useMyMemberProfile,
  useUpdateMyMemberProfile,
  useUploadMemberAvatar,
} from "@/hooks/useMemberProfile";
import { useSupportImpersonation } from "@/hooks/useSupportImpersonation";
import { ProfileCoverBanner } from "@/components/profile/ProfileCoverBanner";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { PerformanceStats } from "@/components/profile/PerformanceStats";
import { EditProfileForm } from "@/components/profile/EditProfileForm";
import type { AppRole } from "@/components/ui/RoleBadge";
import type { Profile, ProfileUpdate } from "@/hooks/useProfile";
import { Loader2 } from "lucide-react";

export default function MyProfilePage() {
  const { data: baseProfile, isLoading: loadingBase } = useMyProfile();
  const { member } = useActiveMember();
  useSupportImpersonation();
  const { data: memberProfile, isLoading: loadingMember } = useMyMemberProfile();
  const updateMember = useUpdateMyMemberProfile();
  const uploadMemberAvatar = useUploadMemberAvatar();
  const { data: tenant } = useMyTenant();
  const { roles } = useAuth();

  // Em modo suporte (superadmin impersonando), `member` já é o alvo
  // (dono/consultor). Se ignorássemos, cairíamos no baseProfile do superadmin
  // — que não tem row em `profiles` — e a página ficaria em branco/carregando.
  const activeProfileMember = member;
  const isLoading = activeProfileMember ? loadingMember : loadingBase;

  // Quando há membro interno ativo: o "perfil" é o do tenant_member.
  // Caso contrário (owner/superadmin sem membro), usa o profile do auth user.
  const profile: Profile | null = activeProfileMember
    ? (memberProfile
        ? ({
            id: memberProfile.id,
            tenant_id: baseProfile?.tenant_id ?? null,
            email: memberProfile.email,
            full_name: memberProfile.full_name ?? memberProfile.display_name,
            display_name: memberProfile.display_name,
            role_label: memberProfile.role_label,
            bio: memberProfile.bio,
            phone: memberProfile.phone,
            avatar_color: memberProfile.avatar_color ?? "#1E40AF",
            avatar_url: memberProfile.avatar_url,
            monthly_goal: memberProfile.monthly_goal ?? 0,
            notification_whatsapp: memberProfile.notification_whatsapp ?? true,
            notification_email: memberProfile.notification_email ?? false,
            last_seen_at: memberProfile.last_seen_at,
            username: memberProfile.username,
            pin_hash: null,
            onboarding_completed: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as unknown as Profile)
        : null)
    : baseProfile ?? null;

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando perfil…
      </div>
    );
  }

  const priority: AppRole[] = ["superadmin", "owner", "supervisor", "consultant", "attendant"];
  const primaryRole: AppRole = activeProfileMember
    ? "consultant"
    : ((priority.find((r) => roles.includes(r as never)) ?? "consultant") as AppRole);

  const handleSave = activeProfileMember
    ? async (patch: ProfileUpdate) => {
        await updateMember.mutateAsync({
          full_name: (patch.full_name as string) ?? null,
          display_name: (patch.display_name as string) ?? null,
          role_label: (patch.role_label as string) ?? null,
          bio: (patch.bio as string) ?? null,
          phone: (patch.phone as string) ?? null,
          avatar_color: (patch.avatar_color as string) ?? null,
          monthly_goal: (patch.monthly_goal as number) ?? null,
          notification_whatsapp: (patch.notification_whatsapp as boolean) ?? null,
          notification_email: (patch.notification_email as boolean) ?? null,
        });
      }
    : undefined;

  return (
    <div className="pb-10">
        <ProfileCoverBanner color={profile.avatar_color ?? "#1E40AF"} />

        <div className="mx-auto max-w-4xl space-y-5 px-3 md:px-6">
          <ProfileHeroCard
            profile={profile}
            role={primaryRole}
            tenantName={tenant?.name}
            editable
            uploadFn={activeProfileMember ? (blob) => uploadMemberAvatar.mutateAsync(blob) : undefined}
            uploadPending={activeProfileMember ? uploadMemberAvatar.isPending : undefined}
          />

          <PerformanceStats
            totalLeads={0}
            totalAppointments={0}
            conversionRate={0}
            avgResponseMinutes={0}
            monthlyGoal={profile.monthly_goal ?? 0}
          />

          <EditProfileForm profile={profile} onSave={handleSave} />
        </div>
    </div>
  );
}
