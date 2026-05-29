import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Link2, KeyRound, UserCircle2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/crm", label: "Início", icon: LayoutDashboard },
  { to: "/configuracoes/convites", label: "Convites", icon: Link2 },
  { to: "/configuracoes/acessos", label: "Acessos", icon: KeyRound, ownerOnly: true },
  { to: "/perfil", label: "Perfil", icon: UserCircle2 },
];

export function AppLayout() {
  const navigate = useNavigate();
  const { displayName, username, isOwner, tenantRole } = useAuth();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="border-b p-4">
          <p className="font-display text-lg font-semibold">CRM</p>
          <p className="truncate text-xs text-muted-foreground">{displayName ?? username}</p>
          {tenantRole && <p className="mt-0.5 text-xs text-primary">{tenantRole}</p>}
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.filter((n) => !n.ownerOnly || isOwner).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
