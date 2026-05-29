import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { useAuth } from "@/contexts/AuthContext";

export type MemberProfile = {
  id: string;
  username: string;
  display_name: string;
  full_name: string | null;
  role_label: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
  monthly_goal: number;
  notification_whatsapp: boolean;
  notification_email: boolean;
  last_seen_at: string | null;
};

export type MemberProfileUpdate = Partial<Omit<MemberProfile, "id" | "username" | "email" | "last_seen_at">>;

export function useMyMemberProfile() {
  const { member } = useActiveMember();
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["my-member-profile", member?.id, tenantId],
    enabled: !!member?.id && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select(
          "id, username, display_name, full_name, role_label, avatar_color, avatar_url, bio, phone, email, monthly_goal, notification_whatsapp, notification_email, last_seen_at",
        )
        .eq("id", member!.id)
        .maybeSingle();
      if (error) throw error;
      return data as MemberProfile | null;
    },
  });
}

export function useUpdateMyMemberProfile() {
  const { member, setMember } = useActiveMember();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: MemberProfileUpdate) => {
      if (!member?.id) throw new Error("sem membro ativo");
      const { error } = await supabase.rpc("update_my_tenant_member", {
        _member_id: member.id,
        _full_name: patch.full_name ?? null,
        _display_name: patch.display_name ?? null,
        _role_label: patch.role_label ?? null,
        _bio: patch.bio ?? null,
        _phone: patch.phone ?? null,
        _avatar_color: patch.avatar_color ?? null,
        _avatar_url: patch.avatar_url ?? null,
        _monthly_goal: patch.monthly_goal ?? null,
        _notification_whatsapp: patch.notification_whatsapp ?? null,
        _notification_email: patch.notification_email ?? null,
      } as never);
      if (error) throw error;
      // sincroniza identidade em memória (cabeçalho/avatar)
      setMember({
        ...member,
        display_name: patch.display_name ?? member.display_name,
        role_label: patch.role_label ?? member.role_label,
        avatar_color: patch.avatar_color ?? member.avatar_color,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-member-profile"] });
      qc.invalidateQueries({ queryKey: ["tenant_members_public"] });
    },
  });
}

export function useUploadMemberAvatar() {
  const { member } = useActiveMember();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: Blob) => {
      if (!member?.id) throw new Error("sem membro ativo");
      const path = `members/${member.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase.rpc("update_my_tenant_member", {
        _member_id: member.id,
        _avatar_url: url,
      } as never);
      if (updErr) throw updErr;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-member-profile"] });
      qc.invalidateQueries({ queryKey: ["tenant_members_public"] });
    },
  });
}
