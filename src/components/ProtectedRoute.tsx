import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { usePermissions } from "@/hooks/usePermissions";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requireSuperadmin?: boolean;
  requireOwner?: boolean;
  allowSupervisor?: boolean;
  denyConsultant?: boolean;
}

export function ProtectedRoute({
  children,
  requireSuperadmin = false,
  requireOwner = false,
  allowSupervisor = false,
  denyConsultant = false,
}: Props) {
  const { session, loading, isSuperadmin: authIsSuperadmin, user } = useAuth();
  const { isSuperadmin, isOwner, isSupervisor, isRoleLoading } = useEffectiveRole();
  const { can } = usePermissions();
  const location = useLocation();
  const roleLoadingForRoute = !requireSuperadmin && isRoleLoading;

  const supervisorOk = allowSupervisor && can("view_whatsapp");
  const denied =
    !!session &&
    !loading &&
    !roleLoadingForRoute &&
    ((requireOwner && !isOwner && !isSuperadmin && !supervisorOk) ||
      (denyConsultant && !isSuperadmin && !isOwner && !isSupervisor) ||
      (requireSuperadmin && !authIsSuperadmin));

  useEffect(() => {
    if (!requireSuperadmin || loading || !authIsSuperadmin || typeof window === "undefined") return;

    window.localStorage.removeItem("impersonation_context");
    const activeKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("feracon.activeMember")) activeKeys.push(key);
    }
    activeKeys.forEach((key) => window.localStorage.removeItem(key));
    if (user?.id) window.sessionStorage.removeItem(`feracon.activeMember.${user.id}`);
    window.dispatchEvent(new Event("feracon:impersonation"));
  }, [authIsSuperadmin, loading, requireSuperadmin, user?.id]);

  useEffect(() => {
    if (denied) {
      toast.error("Você não tem permissão para acessar esta página.");
    }
  }, [denied]);

  if (loading || roleLoadingForRoute) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) {
    return <Navigate to={requireSuperadmin ? "/admin/login" : "/login"} replace state={{ from: location }} />;
  }
  if (requireSuperadmin && !authIsSuperadmin) {
    return <Navigate to="/admin/login" replace />;
  }
  if (requireOwner && !isOwner && !isSuperadmin && !supervisorOk) {
    return <Navigate to="/crm" replace />;
  }
  if (denyConsultant && !isSuperadmin && !isOwner && !isSupervisor) {
    return <Navigate to="/crm" replace />;
  }
  return <>{children}</>;
}

