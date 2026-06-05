import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RoleBadge, type AppRole } from "@/components/ui/RoleBadge";
import { cn } from "@/lib/utils";
import { isHiddenFeraconPerson, isHiddenFeraconUserId } from "@/lib/feracon";

/**
 * Mostra o avatar + nome (+ cargo opcional) de quem está responsável por um lead/conversa.
 * Faz lookup do perfil pelo userId e cacheia globalmente.
 */
export function AssigneeBadge({
  userId,
  showRole = false,
  showName = true,
  size = 24,
  className,
}: {
  userId: string | null | undefined;
  showRole?: boolean;
  showName?: boolean;
  size?: 24 | 28 | 32 | 40 | 48 | 64;
  className?: string;
}) {
  const { data: profile } = useQuery({
    queryKey: ["profile-mini", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, email, avatar_url, avatar_color, role_label")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: roleRow } = useQuery({
    queryKey: ["profile-role", userId],
    enabled: !!userId && showRole,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      return (data?.role ?? null) as AppRole | null;
    },
  });

  if (!userId || isHiddenFeraconUserId(userId)) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <span className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40" style={{ width: size, height: size }} />
        {showName && <span>Sem responsável</span>}
      </span>
    );
  }

  const name = profile?.display_name || profile?.full_name || profile?.email || "Usuário";

  if (isHiddenFeraconPerson(profile as any)) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <UserAvatar
        userId={profile?.id ?? userId}
        name={name}
        avatarUrl={profile?.avatar_url}
        avatarColor={profile?.avatar_color}
        size={size}
      />
      {showName && (
        <span className="truncate text-xs font-medium text-foreground">
          {profile?.display_name?.split(" ")[0] || profile?.full_name?.split(" ")[0] || name}
        </span>
      )}
      {showRole && roleRow && (
        <RoleBadge role={roleRow} customLabel={profile?.role_label} size="sm" />
      )}
    </span>
  );
}
