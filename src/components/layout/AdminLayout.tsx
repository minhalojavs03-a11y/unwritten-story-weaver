import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, Smartphone, Sparkles, FileText, Workflow, Megaphone, CreditCard, LogOut, UserCircle2, Menu, Plug, Users2, Repeat, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { ImpersonateDialog } from "@/components/admin/ImpersonateDialog";
import logoFeraconMark from "@/assets/logo-feracon-mark.png";
import logoFeraconLight from "@/assets/logo-feracon-light.png";

const nav = [
  { to: "/admin/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/admin/clientes", label: "Clientes", icon: Building2 },
  { to: "/admin/equipes", label: "Equipes", icon: Users2 },
  { to: "/admin/instancias", label: "Instâncias WhatsApp", icon: Smartphone },
  { to: "/admin/ia", label: "Assistente IA", icon: Sparkles },
  { to: "/admin/templates", label: "Mensagens Prontas", icon: FileText },
  { to: "/admin/automacoes", label: "Automações", icon: Workflow },
  { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/admin/integracoes", label: "Integrações", icon: Plug },
  { to: "/admin/financeiro", label: "Financeiro", icon: CreditCard },
  { to: "/admin/menus", label: "Controle de Menus", icon: ListChecks },
];

// 4 itens essenciais para gestão diária no rodapé mobile
const mobileNav = [
  { to: "/admin/dashboard", label: "Visão", icon: LayoutDashboard },
  { to: "/admin/clientes", label: "Clientes", icon: Building2 },
  { to: "/admin/instancias", label: "WhatsApp", icon: Smartphone },
  { to: "/admin/financeiro", label: "Financeiro", icon: CreditCard },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  }
  return (
    <div className="admin-shell flex min-h-screen w-full max-w-full overflow-x-hidden text-white">
      <aside className="admin-sidebar hidden w-64 shrink-0 flex-col md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
          <img src={logoFeraconMark} alt="Feracon" className="h-9 w-9 object-contain" />
          <div>
            <div className="font-display text-base font-bold leading-tight text-white">Consórcio Feracon</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">Superadmin</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "admin-nav-active"
                    : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-white" : "text-white/50 group-hover:text-white")} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-white/5 p-3">
          <button
            onClick={() => setImpersonateOpen(true)}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <Repeat className="h-4 w-4" /> Entrar como cliente
          </button>
          <NavLink
            to="/dashboard"
            className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <UserCircle2 className="h-4 w-4" /> Ver painel cliente
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden pb-16 md:pb-0">
        <header className="admin-header sticky top-0 z-10 flex h-14 items-center justify-between gap-2 px-3 md:justify-end md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger aria-label="Abrir menu" className="-ml-1 rounded-lg p-2 text-white/70 hover:bg-white/10">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="admin-sidebar w-72 border-white/5 p-0 text-white">
                <SheetHeader className="flex h-16 flex-row items-center gap-3 space-y-0 border-b border-white/5 px-5 text-left">
                  <img src={logoFeraconMark} alt="Feracon" className="h-9 w-9 object-contain" />
                  <div>
                    <SheetTitle className="font-display text-base font-bold leading-tight text-white">Consórcio Feracon</SheetTitle>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">Superadmin</div>
                  </div>
                </SheetHeader>
                <nav className="flex-1 space-y-1 p-3">
                  {nav.map((item) => {
                    const active = location.pathname.startsWith(item.to);
                    const Icon = item.icon;
                    return (
                      <SheetClose asChild key={item.to}>
                        <NavLink
                          to={item.to}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                            active ? "admin-nav-active" : "text-white/60 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          <Icon className={cn("h-4 w-4", active ? "text-white" : "text-white/50")} />
                          {item.label}
                        </NavLink>
                      </SheetClose>
                    );
                  })}
                </nav>
                <div className="border-t border-white/5 p-3">
                  <SheetClose asChild>
                    <button onClick={() => setImpersonateOpen(true)} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">
                      <Repeat className="h-4 w-4" /> Entrar como cliente
                    </button>
                  </SheetClose>
                  <SheetClose asChild>
                    <NavLink to="/dashboard" className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white">
                      <UserCircle2 className="h-4 w-4" /> Ver painel cliente
                    </NavLink>
                  </SheetClose>
                  <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white">
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <img src={logoFeraconLight} alt="Consórcio Feracon" className="h-7 w-auto object-contain" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setImpersonateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 hover:text-white md:px-3.5 md:text-xs"
            >
              <Repeat className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Trocar de conta</span><span className="sm:hidden">Trocar</span>
            </button>
            <NavLink
              to="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 hover:text-white md:px-3.5 md:text-xs"
            >
              <UserCircle2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver painel cliente</span><span className="sm:hidden">Cliente</span>
            </NavLink>
            <button onClick={handleLogout} aria-label="Sair" className="text-white/60 hover:text-white md:hidden">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav — 4 itens essenciais */}
      <nav className="admin-header fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch md:hidden">
        {mobileNav.map((item) => {
          const active = location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                active ? "text-white" : "text-white/60",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <ImpersonateDialog open={impersonateOpen} onOpenChange={setImpersonateOpen} />
    </div>
  );
}
