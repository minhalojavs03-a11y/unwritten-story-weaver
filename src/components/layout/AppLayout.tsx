import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, MessageCircle, Kanban, Calendar, Users, Settings, LogOut, Shield, Smartphone, Menu, Inbox, User as UserIcon, Users2, ChevronLeft, ChevronRight, Trophy, BarChart3, Target, Repeat, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";
import { usePermissions } from "@/hooks/usePermissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMyProfile } from "@/hooks/useProfile";
import { useTenantMembers } from "@/hooks/useData";
import { useUpdateLastSeen } from "@/hooks/useUpdateLastSeen";
import { MemberLoginDialog } from "@/components/MemberLoginDialog";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { TopAlertBanner } from "@/components/layout/TopAlertBanner";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { ImpersonateDialog } from "@/components/admin/ImpersonateDialog";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useEffect, useMemo, useState } from "react";

import { TutorialVideoDialog } from "@/components/TutorialVideoDialog";
import logoCatelanWhite from "@/assets/logo-catelan-white.png";
import logoFeraconDark from "@/assets/logo-feracon-dark.png";
import logoFeraconMark from "@/assets/logo-feracon-mark.png";

type NavItem = { to: string; label: string; icon: any };

// 4 itens essenciais do dia a dia no rodapé mobile
const mobileNav: NavItem[] = [
  { to: "/crm", label: "Início", icon: Home },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/leads/fila", label: "Fila", icon: Inbox },
  { to: "/conversas", label: "Conversas", icon: MessageCircle },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSuperadmin, isOwner } = useEffectiveRole();
  const { data: profile } = useMyProfile();
  const { member, clearMember } = useActiveMember();
  const { data: members = [] } = useTenantMembers();
  useUpdateLastSeen();
  const { can } = usePermissions();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar_collapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);
  const isSupervisor = can("configure_whatsapp") && !isOwner && !isSuperadmin;

  // Lista única por papel — só o que realmente importa no dia a dia.
  // Itens menos usados ficam em /configuracoes (Mensagens prontas, Gravações,
  // Treinar IA, Integrações, WhatsApp instâncias, Histórico de updates).
  const navItems: NavItem[] = useMemo(() => {
    const home: NavItem = { to: "/crm", label: "Início", icon: Home };
    const fila: NavItem = { to: "/leads/fila", label: "Fila de leads", icon: Inbox };
    const conversas: NavItem = { to: "/conversas", label: "Conversas", icon: MessageCircle };
    const pipeline: NavItem = { to: "/pipeline", label: "Pipeline", icon: Kanban };
    const leads: NavItem = { to: "/leads", label: isOwner || isSuperadmin || isSupervisor ? "Leads" : "Meus leads", icon: Users };
    const agenda: NavItem = { to: "/agenda", label: "Agenda", icon: Calendar };
    const ranking: NavItem = { to: "/ranking", label: "Ranking", icon: Trophy };
    const relatorios: NavItem = { to: "/relatorios", label: "Relatórios", icon: BarChart3 };
    const coaching: NavItem = { to: "/coaching", label: "Coaching IA", icon: Target };
    const consultores: NavItem = { to: "/consultores", label: "Consultores", icon: Users2 };
    const equipe: NavItem = { to: "/equipe", label: "Equipe", icon: Users2 };
    const distribuicao: NavItem = { to: "/distribuicao", label: "Distribuição", icon: Share2 };
    const meuWa: NavItem = { to: "/meu-whatsapp", label: "Meu WhatsApp", icon: Smartphone };
    const config: NavItem = { to: "/configuracoes", label: "Configurações", icon: Settings };

    if (isOwner || isSuperadmin) {
      return [home, fila, conversas, pipeline, leads, agenda, ranking, relatorios, coaching, consultores, equipe, distribuicao, config];
    }
    if (isSupervisor) {
      return [home, fila, conversas, pipeline, leads, agenda, ranking, relatorios, consultores, config];
    }
    // Consultor
    return [home, fila, conversas, pipeline, leads, agenda, meuWa, ranking, config];
  }, [isOwner, isSuperadmin, isSupervisor]);

  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const isConversasMobile = location.pathname === "/conversas" || location.pathname.startsWith("/conversas/");
  // Páginas tipo chat precisam ocupar a viewport inteira (sem scroll do navegador).
  const lockViewport = isConversasMobile;

  const { items: notifItems } = useNotifications();
  const liveBadges = useNavBadges();
  const navBadges = useMemo(() => {
    const conversasNotif = notifItems.filter(
      (i) => !i.read && (i.type === "new_message" || i.type === "lead_assigned" || i.type === "lead_status")
    ).length;
    const filaNotif = notifItems.filter((i) => !i.read && i.type === "new_lead").length;
    return {
      "/conversas": liveBadges.conversas || conversasNotif,
      "/leads/fila": liveBadges.fila || filaNotif,
    } as Record<string, number>;
  }, [notifItems, liveBadges.conversas, liveBadges.fila]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[240px]";

  return (
    <div className={cn(
      "client-shell flex w-full max-w-full",
      lockViewport ? "h-dvh min-h-0 overflow-hidden" : "min-h-dvh",
    )}>
      {/* Desktop sidebar — lista única */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 self-start md:flex", sidebarWidth, "transition-all")}>
        <TooltipProvider delayDuration={100}>
          <div className="client-sidebar relative flex w-full flex-col border-r border-white/5 py-3">
            <button
              type="button"
              onClick={() => navigate("/crm")}
              className={cn("mb-3 flex items-center", collapsed ? "mx-auto h-12 w-12 justify-center" : "mx-3 h-12 gap-2 px-1")}
              aria-label="Início"
            >
              <img src={logoFeraconMark} alt="Feracon" className="h-10 w-10 object-contain" />
              {!collapsed && <img src={logoCatelanWhite} alt="Consórcio Feracon" className="h-7 w-auto object-contain opacity-90" />}
            </button>

            <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-2" : "px-2")}>
              {navItems.map((item) => (
                <SidebarNavLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  location={location}
                  navBadges={navBadges}
                />
              ))}
            </nav>

            <div className="mt-2 flex flex-col items-stretch gap-1 border-t border-white/5 px-2 pt-2">
              {isSuperadmin && (
                <SidebarNavLink
                  item={{ to: "/admin", label: "Painel admin", icon: Shield }}
                  collapsed={collapsed}
                  location={location}
                  navBadges={navBadges}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    aria-label="Sair"
                    className={cn(
                      "flex items-center rounded-xl text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white",
                      collapsed ? "h-11 w-11 justify-center mx-auto" : "gap-3 px-3 py-2.5",
                    )}
                  >
                    <LogOut className={collapsed ? "h-[22px] w-[22px]" : "h-4 w-4"} />
                    {!collapsed && <span>Sair</span>}
                  </button>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">Sair</TooltipContent>}
              </Tooltip>
            </div>

            {/* Toggle colapsar */}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#0f0f18] text-white/70 hover:text-white md:flex"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
        </TooltipProvider>
      </aside>

      {/* Main */}
      <main className={cn(
        "flex min-w-0 flex-1 flex-col pb-16 md:pb-0 bg-[#d11e26] md:bg-transparent",
        lockViewport && "min-h-0 overflow-hidden",
      )}>
        <ImpersonationBanner />
        <TopAlertBanner />
        <div aria-hidden className={cn("h-4 bg-[#d11e26]", isConversasMobile ? "hidden" : "md:hidden")} />
        <header className={cn(
          "client-header sticky top-0 z-40 mx-3 -mt-3 flex h-14 items-center justify-between rounded-t-[28px] border border-black/5 !bg-white px-4 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.18)] [backdrop-filter:none] md:mx-0 md:mt-0 md:h-12 md:justify-end md:rounded-none md:border-0 md:!bg-transparent md:px-4 md:shadow-none",
          isConversasMobile && "hidden md:flex",
        )}>
          <div className="flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger aria-label="Abrir menu" className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="client-sidebar flex w-72 flex-col border-white/5 p-0 text-[hsl(210_40%_96%)]">
                <SheetHeader className="flex h-20 shrink-0 flex-row items-center space-y-0 border-b border-white/5 px-4 text-left">
                  <SheetTitle className="sr-only">Consórcio Feracon</SheetTitle>
                  <img src={logoCatelanWhite} alt="Consórcio Feracon" className="max-h-14 w-auto cursor-pointer object-contain" onClick={() => navigate("/crm")} />
                </SheetHeader>
                <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
                  {navItems.map((item) => (
                    <MobileNavRow key={item.to} item={item} location={location} navBadges={navBadges} />
                  ))}
                </nav>
                <div className="shrink-0 border-t border-white/5 p-3">
                  {isSuperadmin && (
                    <SheetClose asChild>
                      <NavLink to="/admin" className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
                        <Shield className="h-4 w-4" /> Painel admin
                      </NavLink>
                    </SheetClose>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium client-nav-idle"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <img src={logoFeraconDark} alt="Consórcio Feracon" className="h-9 w-auto cursor-pointer object-contain" onClick={() => navigate("/crm")} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-primary">
                <UserAvatar
                  userId={member?.id ?? profile?.id}
                  name={member?.display_name ?? profile?.full_name ?? profile?.email ?? "?"}
                  avatarUrl={member ? (members.find((mm) => mm.id === member.id)?.avatar_url ?? null) : profile?.avatar_url}
                  avatarColor={member?.avatar_color ?? profile?.avatar_color}
                  size={32}
                />
                <div className="hidden flex-col items-start leading-tight md:flex">
                  <span className="text-sm font-medium text-foreground">
                    {member?.display_name ?? profile?.display_name ?? profile?.full_name?.split(" ")[0] ?? "Perfil"}
                  </span>
                  {member && (
                    <span className="text-[10px] text-muted-foreground">
                      @{member.username}{member.role_label ? ` · ${member.role_label}` : ""}
                    </span>
                  )}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => navigate("/perfil")}>
                  <UserIcon className="mr-2 h-4 w-4" /> Meu perfil
                </DropdownMenuItem>
                {isOwner && (
                  <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
                    <Settings className="mr-2 h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                )}
                {isSuperadmin && (
                  <DropdownMenuItem onClick={() => setImpersonateOpen(true)}>
                    <Repeat className="mr-2 h-4 w-4" /> Trocar de conta
                  </DropdownMenuItem>
                )}
                {member && (
                  <DropdownMenuItem onClick={clearMember}>
                    <UserIcon className="mr-2 h-4 w-4" /> Trocar @usuário interno
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <MemberLoginDialog />
        <ImpersonateDialog open={impersonateOpen} onOpenChange={setImpersonateOpen} />
        <TutorialVideoDialog />
        <div className={cn(
          "flex min-w-0 max-w-full flex-1 flex-col bg-background md:bg-transparent",
          lockViewport ? "min-h-0 overflow-x-hidden overflow-y-auto" : "overflow-x-hidden",
        )}>
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch border-t border-black/5 !bg-white shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] [backdrop-filter:none] md:hidden">
        {mobileNav.map((item) => {
          const active = item.to === "/leads" ? location.pathname === "/leads" : (location.pathname === item.to || location.pathname.startsWith(item.to + "/"));
          const Icon = item.icon;
          const badge = navBadges[item.to] ?? 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative inline-flex">
                <Icon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarNavLink({
  item,
  collapsed,
  location,
  navBadges,
}: {
  item: NavItem;
  collapsed: boolean;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
}) {
  const active = item.to === "/leads"
    ? location.pathname === "/leads"
    : (location.pathname === item.to || location.pathname.startsWith(item.to + "/"));
  const Icon = item.icon;
  const badge = navBadges[item.to] ?? 0;
  const link = (
    <NavLink
      to={item.to}
      className={cn(
        "group relative flex items-center rounded-xl text-sm font-medium transition-all",
        active ? "client-nav-active" : "client-nav-idle",
        collapsed ? "h-11 w-11 justify-center mx-auto" : "gap-3 px-3 py-2.5",
      )}
    >
      <span className="relative inline-flex">
        <Icon className={cn(collapsed ? "h-[22px] w-[22px]" : "h-4 w-4")} />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[hsl(var(--sidebar-background,222_47%_11%))]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1.5 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function MobileNavRow({
  item,
  location,
  navBadges,
}: {
  item: NavItem;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
}) {
  const active = item.to === "/leads"
    ? location.pathname === "/leads"
    : (location.pathname === item.to || location.pathname.startsWith(item.to + "/"));
  const Icon = item.icon;
  const badge = navBadges[item.to] ?? 0;
  return (
    <SheetClose asChild>
      <NavLink
        to={item.to}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
          active ? "client-nav-active" : "client-nav-idle",
        )}
      >
        <span className="relative inline-flex">
          <Icon className="h-4 w-4" />
          {badge > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1 text-[9px] font-bold leading-none text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span className="flex-1">{item.label}</span>
        {badge > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1.5 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </NavLink>
    </SheetClose>
  );
}
