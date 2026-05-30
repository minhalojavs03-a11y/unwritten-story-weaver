import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "superadmin" | "owner" | "attendant";

type AuthContextRow = {
  tenant_id: string | null;
  roles: AppRole[] | null;
  username: string | null;
  onboarding_completed: boolean | null;
};

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  tenantId: string | null;
  roles: AppRole[];
  username: string | null;
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
  roles: [],
  username: null,
  onboardingCompleted: false,
  isSuperadmin: false,
  isOwner: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);

  const withTimeout = useCallback(<T,>(promise: PromiseLike<T>, label: string) => {
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(`Tempo esgotado ao ${label}`)), 8000);
    });
    return Promise.race([Promise.resolve(promise), timeout]);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const rpcResult = await withTimeout(
        supabase.rpc("get_my_auth_context").maybeSingle(),
        "carregar contexto do usuário",
      );

      if (!rpcResult.error && rpcResult.data) {
        const data = rpcResult.data as AuthContextRow;
        return {
          tenantId: data.tenant_id ?? null,
          roles: data.roles ?? [],
          username: data.username ?? null,
          onboardingCompleted: data.onboarding_completed ?? false,
        };
      }

      if (rpcResult.error) console.warn("Auth context RPC failed; using direct profile lookup", rpcResult.error);
    } catch (error) {
      console.warn("Auth context RPC timed out; using direct profile lookup", error);
    }

    const [profileResult, rolesResult] = await withTimeout(Promise.all([
      supabase.from("profiles").select("tenant_id, username, onboarding_completed").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]), "carregar perfil direto");

    if (profileResult.error) throw profileResult.error;
    if (rolesResult.error) throw rolesResult.error;

    const pdata = profileResult.data as { tenant_id: string | null; username: string | null; onboarding_completed: boolean | null } | null;
    return {
      tenantId: pdata?.tenant_id ?? null,
      roles: ((rolesResult.data ?? []) as { role: AppRole }[]).map((item) => item.role),
      username: pdata?.username ?? null,
      onboardingCompleted: pdata?.onboarding_completed ?? false,
    };
  }, [withTimeout]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setProfileReady(!s?.user);
      setAuthReady(true);
    });

    withTimeout(supabase.auth.getSession(), "restaurar sessão").then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    }).catch((error) => {
      console.error("Auth session restore failed", error);
      setSession(null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [withTimeout]);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    setProfileReady(false);

    if (!session?.user) {
      setTenantId(null);
      setRoles([]);
      setUsername(null);
      setOnboardingCompleted(false);
      setProfileUserId(null);
      setProfileReady(true);
      return () => { active = false; };
    }

    loadProfile(session.user.id)
      .then((profile) => {
        if (!active) return;
        setTenantId(profile.tenantId);
        setRoles(profile.roles);
        setUsername(profile.username);
        setOnboardingCompleted(profile.onboardingCompleted);
        setProfileUserId(session.user.id);
      })
      .catch((error) => {
        console.error("Auth profile load failed", error);
        if (!active) return;
        setTenantId(null);
        setRoles([]);
        setUsername(null);
        setOnboardingCompleted(false);
        setProfileUserId(session.user.id);
      })
      .finally(() => {
        if (active) setProfileReady(true);
      });

    return () => { active = false; };
  }, [authReady, session, loadProfile]);

  async function refreshProfile() {
    if (!session?.user) return;
    setProfileReady(false);
    try {
      const profile = await loadProfile(session.user.id);
      setTenantId(profile.tenantId);
      setRoles(profile.roles);
      setUsername(profile.username);
      setOnboardingCompleted(profile.onboardingCompleted);
      setProfileUserId(session.user.id);
    } catch (error) {
      console.error("Auth profile refresh failed", error);
    } finally {
      setProfileReady(true);
    }
  }

  const loading = !authReady || !profileReady || (!!session?.user && profileUserId !== session.user.id);
  const isSuperadmin = roles.includes("superadmin");
  // Superadmin herda todas as permissões de dono em qualquer tenant
  const isOwner = roles.includes("owner") || isSuperadmin;

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, tenantId, roles, username, onboardingCompleted, isSuperadmin, isOwner, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
