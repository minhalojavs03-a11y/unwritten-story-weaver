import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "superadmin" | "owner" | "attendant";
type TenantRole = "owner" | "supervisor" | "consultor";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  roles: AppRole[];
  username: string | null;
  displayName: string | null;
  onboardingCompleted: boolean;
  isSuperadmin: boolean;
  isOwner: boolean;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  tenantId: null,
  tenantRole: null,
  roles: [],
  username: null,
  displayName: null,
  onboardingCompleted: false,
  isSuperadmin: false,
  isOwner: false,
  refreshProfile: async () => {},
});

type ProfileState = {
  tenantId: string | null;
  tenantRole: TenantRole | null;
  isSuperadmin: boolean;
  displayName: string | null;
  email: string | null;
  onboardingCompleted: boolean;
};

const EMPTY_PROFILE: ProfileState = {
  tenantId: null,
  tenantRole: null,
  isSuperadmin: false,
  displayName: null,
  email: null,
  onboardingCompleted: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);

  const loadProfile = useCallback(async (): Promise<ProfileState> => {
    const { data, error } = await supabase.rpc("get_my_auth_context").maybeSingle();
    if (error) {
      console.warn("get_my_auth_context failed", error);
      return EMPTY_PROFILE;
    }
    if (!data) return EMPTY_PROFILE;
    return {
      tenantId: data.tenant_id ?? null,
      tenantRole: (data.tenant_role as TenantRole | null) ?? null,
      isSuperadmin: !!data.is_superadmin,
      displayName: data.display_name ?? null,
      email: data.email ?? null,
      onboardingCompleted: !!data.onboarding_completed,
    };
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
      if (!s?.user) setProfileReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    if (!session?.user) {
      setProfile(EMPTY_PROFILE);
      setProfileReady(true);
      return () => { active = false; };
    }
    setProfileReady(false);
    loadProfile()
      .then((p) => { if (active) setProfile(p); })
      .finally(() => { if (active) setProfileReady(true); });
    return () => { active = false; };
  }, [authReady, session, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const p = await loadProfile();
    setProfile(p);
  }, [session, loadProfile]);

  const roles: AppRole[] = [];
  if (profile.isSuperadmin) roles.push("superadmin");
  if (profile.tenantRole === "owner") roles.push("owner");
  else if (profile.tenantRole) roles.push("attendant");

  const loading = !authReady || (!!session?.user && !profileReady);

  return (
    <Ctx.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      tenantId: profile.tenantId,
      tenantRole: profile.tenantRole,
      roles,
      username: profile.email,
      displayName: profile.displayName,
      onboardingCompleted: profile.onboardingCompleted,
      isSuperadmin: profile.isSuperadmin,
      isOwner: profile.tenantRole === "owner",
      refreshProfile,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
