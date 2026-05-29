import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: ReactNode;
  requireSuperadmin?: boolean;
  requireOwner?: boolean;
}

export function ProtectedRoute({ children, requireSuperadmin = false, requireOwner = false }: Props) {
  const { session, loading, isSuperadmin, isOwner, tenantId, onboardingCompleted } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) {
    return <Navigate to={requireSuperadmin ? "/admin/login" : "/login"} replace state={{ from: location }} />;
  }
  if (requireSuperadmin && !isSuperadmin) return <Navigate to="/admin/login" replace />;
  if (requireOwner && !isOwner && !isSuperadmin) return <Navigate to="/crm" replace />;

  // If user has no tenant and isn't superadmin, force onboarding
  if (!isSuperadmin && !tenantId && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  // If onboarding pending
  if (!isSuperadmin && tenantId && !onboardingCompleted && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
