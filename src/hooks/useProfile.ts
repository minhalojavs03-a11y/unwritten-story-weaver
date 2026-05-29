import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

const EDITABLE_FIELDS = [
  "full_name", "display_name", "bio", "phone",
  "role_label", "monthly_goal", "avatar_color",
  "notification_whatsapp", "notification_email", "avatar_url",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ProfileUpdate = Pick<TablesUpdate<"profiles">, EditableField>;

export function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useProfileById(userId?: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useUpdateMyProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!user?.id) throw new Error("sem usuário");
      // sanitiza: só os campos permitidos
      const safe: ProfileUpdate = {};
      for (const k of EDITABLE_FIELDS) {
        if (k in patch) (safe as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
      }
      const { error } = await supabase.from("profiles").update(safe).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useUploadAvatar() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: Blob) => {
      if (!user?.id) throw new Error("sem usuário");
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      // cache-bust para refletir nova foto imediatamente
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (updErr) throw updErr;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
