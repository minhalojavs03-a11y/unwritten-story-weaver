import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RootRedirect() {
  const { loading, session, isSuperadmin } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (isSuperadmin) return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/crm" replace />;
}