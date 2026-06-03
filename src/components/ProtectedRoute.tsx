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
  const { session, loading } = useAuth();
  const { isSuperadmin, isOwner, isSupervisor } = useEffectiveRole();
  const { can } = usePermissions();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) {
    return <Navigate to={requireSuperadmin ? "/admin/login" : "/login"} replace state={{ from: location }} />;
  }
  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/admin/login" replace />;
  }
  const denied =
    (requireOwner && !isOwner && !isSuperadmin && !(allowSupervisor && can("view_whatsapp"))) ||
    (denyConsultant && !isSuperadmin && !isOwner && !isSupervisor);

  useEffect(() => {
    if (denied && session) {
      toast.error("Você não tem permissão para acessar esta página.");
    }
  }, [denied, session]);

  if (requireOwner && !isOwner && !isSuperadmin) {
    const supervisorOk = allowSupervisor && can("view_whatsapp");
    if (!supervisorOk) return <Navigate to="/crm" replace />;
  }
  if (denyConsultant && !isSuperadmin && !isOwner && !isSupervisor) {
    return <Navigate to="/crm" replace />;
  }
  return <>{children}</>;
}

