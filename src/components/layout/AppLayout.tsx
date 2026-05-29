import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, MessageCircle, Kanban, Calendar, Users, UserPlus, Settings, LogOut, Eye, Shield, Smartphone, Menu, Sparkles, Inbox, User as UserIcon, Users2, MessageSquareText, ChevronLeft, ChevronRight, Video, History, Trophy, BarChart3, ChevronDown, Headphones, Briefcase, LineChart, Cog, Target } from "lucide-react";
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
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useEffect, useMemo, useState } from "react";

import { TutorialVideoDialog } from "@/components/TutorialVideoDialog";
import logoCatelan from "@/assets/logo-catelan.png";
import logoCatelanDark from "@/assets/logo-catelan-dark.png";
import logoFeraconDark from "@/assets/logo-feracon-dark.png";
import logoCatelanWhite from "@/assets/logo-catelan-white.png";
import logoFeraconMark from "@/assets/logo-feracon-mark.png";

type NavItem = { to: string; label: string; icon: any };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

const homeItem: NavItem = { to: "/crm", label: "Início", icon: Home };

// Atalhos do rail (sem submenu) — itens mais utilizados
const quickLinks: NavItem[] = [
  { to: "/leads/fila", label: "Fila", icon: Inbox },
  { to: "/conversas", label: "Conversas", icon: MessageCircle },
];

const groupVendas: NavGroup = {
  id: "vendas",
  label: "Vendas",
  icon: Kanban,
  items: [
    { to: "/pipeline", label: "Pipeline", icon: Kanban },
    { to: "/agenda", label: "Agenda", icon: Calendar },
  ],
};
const groupClientes: NavGroup = {
  id: "clientes",
  label: "Clientes",
  icon: Briefcase,
  items: [
    { to: "/leads", label: "Lista de Leads", icon: Users },
    { to: "/gravacoes", label: "Gravações", icon: Video },
  ],
};
const groupPerformance: NavGroup = {
  id: "performance",
  label: "Performance",
  icon: LineChart,
  items: [
    { to: "/ranking", label: "Ranking", icon: Trophy },
    { to: "/coaching", label: "Coaching IA", icon: Target },
    { to: "/relatorios", label: "Relatórios & BI", icon: BarChart3 },
  ],
};
const changelogItem: NavItem = { to: "/changelog", label: "Histórico de updates", icon: History };



// 4 itens essenciais do dia a dia do vendedor no rodapé mobile
const mobileNav = [
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

  // Grupo "Conteúdo & IA" (Mensagens prontas + Treinar IA – owner only para IA)
  const conteudoItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { to: "/mensagens-prontas", label: "Mensagens prontas", icon: MessageSquareText },
    ];
    if (isOwner) items.push({ to: "/treinar-ia", label: "Treinar IA", icon: Sparkles });
    return items;
  }, [isOwner]);

  const groupConteudo: NavGroup = {
    id: "conteudo",
    label: "Conteúdo & IA",
    icon: Sparkles,
    items: conteudoItems,
  };

  // Grupo Gestão dinâmico conforme papel
  const gestaoItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [];
    if (isOwner) {
      items.push({ to: "/consultores", label: "Consultores", icon: Users2 });
      items.push({ to: "/distribuicao", label: "Distribuição de Leads", icon: Inbox });
      items.push({ to: "/equipe", label: "Equipe", icon: Users2 });
      items.push({ to: "/whatsapp", label: "WhatsApp", icon: Smartphone });
      items.push({ to: "/configuracoes", label: "Configurações", icon: Settings });
    } else if (can("view_team_metrics")) {
      items.push({ to: "/consultores", label: "Consultores", icon: Users2 });
      items.push({ to: "/distribuicao", label: "Distribuição de Leads", icon: Inbox });
      if (isSupervisor) items.push({ to: "/whatsapp", label: "WhatsApp", icon: Smartphone });
    } else if (can("view_all_leads") && !isSupervisor && !isSuperadmin) {
      items.push({ to: "/meu-whatsapp", label: "Meu WhatsApp", icon: Smartphone });
    }
    return items;
  }, [isOwner, isSupervisor, isSuperadmin, can]);

  const groupGestao: NavGroup | null = gestaoItems.length
    ? { id: "gestao", label: "Gestão", icon: Cog, items: gestaoItems }
    : null;

  const groups: NavGroup[] = useMemo(() => {
    const isPrioritized = isOwner || isSuperadmin || isSupervisor;
    const g: NavGroup[] = isPrioritized
      ? [groupPerformance, groupVendas, groupClientes, groupConteudo]
      : [groupVendas, groupClientes, groupConteudo, groupPerformance];
    if (groupGestao) g.push(groupGestao);
    return g;
  }, [groupConteudo, groupGestao, groupPerformance, groupVendas, groupClientes, isOwner, isSuperadmin, isSupervisor]);



  // Flat list para mobile sheet + bottom nav badges
  const flatNav: NavItem[] = useMemo(
    () => [homeItem, ...groups.flatMap((g) => g.items), changelogItem],
    [groups],
  );

  // Trilho ativo (qual categoria está visível no painel direito).
  // Auto-sincroniza com a rota; usuário pode trocar clicando no rail.
  const routeRailId = useMemo(() => {
    const found = groups.find((g) =>
      g.items.some((it) => it.to === "/leads" ? location.pathname === "/leads" : (location.pathname === it.to || location.pathname.startsWith(it.to + "/"))),
    );
    return found?.id ?? null;
  }, [location.pathname, groups]);

  const [activeRail, setActiveRail] = useState<string | null>(null);
  useEffect(() => { setActiveRail(routeRailId); }, [routeRailId]);

  // Painel pode ser escondido (deixa só o rail estreito visível) — não persiste entre sessões
  const [panelHidden, setPanelHidden] = useState<boolean>(false);

  const activeGroup = groups.find((g) => g.id === activeRail) ?? null;


  const isConversasMobile = location.pathname === "/conversas" || location.pathname.startsWith("/conversas/");
  // Páginas tipo chat precisam ocupar a viewport inteira (sem scroll do navegador).
  // Demais páginas usam o scroll natural do navegador.
  const lockViewport = isConversasMobile;


  const { items: notifItems } = useNotifications();
  const liveBadges = useNavBadges();
  const navBadges = useMemo(() => {
    // Prioriza contagens reais (mensagens não lidas + leads ativos na fila).
    // Fallback para notificações não lidas caso a contagem ainda não tenha carregado.
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

  return (
    <div className={cn(
      "client-shell flex w-full max-w-full",
      lockViewport ? "h-dvh min-h-0 overflow-hidden" : "min-h-dvh",
    )}>
      {/* Desktop sidebar — Rail (categorias) + Painel (itens da categoria ativa) */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 self-start md:flex">
        <TooltipProvider delayDuration={100}>
          {/* RAIL estreito */}
          <div className="client-sidebar flex w-[88px] flex-col items-center border-r border-white/5 py-3">

            <button
              type="button"
              onClick={() => navigate("/crm")}
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              aria-label="Início"
            >
              <img src={logoFeraconMark} alt="Feracon" className="h-10 w-10 object-contain" />
            </button>

            <div className="flex flex-1 flex-col items-stretch gap-1 px-2">
              {quickLinks.map((item) => (
                <RailLink
                  key={item.to}
                  item={item}
                  location={location}
                  badge={navBadges[item.to] ?? 0}
                />
              ))}
              <div className="my-1 h-px bg-white/5" />
              {groups.map((group) => {
                const hasActiveRoute = group.items.some((it) =>
                  it.to === "/leads" ? location.pathname === "/leads" : (location.pathname === it.to || location.pathname.startsWith(it.to + "/")),
                );
                const badgeTotal = group.items.reduce((sum, it) => sum + (navBadges[it.to] ?? 0), 0);
                return (
                  <RailItem
                    key={group.id}
                    id={group.id}
                    label={group.label}
                    Icon={group.icon}
                    active={activeRail === group.id}
                    routeActive={hasActiveRoute}
                    badge={badgeTotal}
                    onClick={() => { setActiveRail(group.id); setPanelHidden(false); }}
                  />
                );
              })}
            </div>


            {/* Rodapé do rail: notificações já estão no header; admin + sair */}
            <div className="mt-2 flex flex-col items-center gap-2 pb-1">
              {isSuperadmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink to="/admin" className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
                      <Shield className="h-5 w-5" />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">Painel admin</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    aria-label="Sair"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* PAINEL com os itens da categoria ativa */}
          {!panelHidden && activeGroup && (
            <div className="flex w-[244px] flex-col border-r border-white/5 bg-[#0f0f18]">
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex min-w-0 items-center gap-2 text-white">
                  {activeGroup ? (
                    <>
                      <activeGroup.icon className="h-4 w-4 opacity-80" />
                      <span className="truncate text-[15px] font-semibold">{activeGroup.label}</span>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setPanelHidden(true)}
                  aria-label="Esconder painel"
                  title="Esconder painel"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                {activeGroup?.items.map((item) => (
                  <PanelNavLink key={item.to} item={item} location={location} navBadges={navBadges} />
                ))}
              </nav>

              <div className="border-t border-white/5 px-2 py-2">
                <PanelNavLink item={changelogItem} location={location} navBadges={navBadges} subtle />
              </div>
            </div>
          )}

          {panelHidden && (
            <button
              type="button"
              onClick={() => setPanelHidden(false)}
              aria-label="Mostrar painel"
              title="Mostrar painel"
              className="absolute left-[88px] top-4 z-10 flex h-7 w-7 items-center justify-center rounded-r-md border border-l-0 border-white/10 bg-[#0f0f18] text-white/70 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </TooltipProvider>
      </aside>


      {/* Main */}
      <main className={cn(
        "flex min-w-0 flex-1 flex-col pb-16 md:pb-0 bg-[#d11e26] md:bg-transparent",
        lockViewport && "min-h-0 overflow-hidden",
      )}>

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
                <MobileNavRow item={homeItem} location={location} navBadges={navBadges} />
                {quickLinks.map((item) => (
                  <MobileNavRow key={item.to} item={item} location={location} navBadges={navBadges} />
                ))}

                {groups.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.id} className="pt-3 first:pt-0">
                      <div className="flex items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                        <GroupIcon className="h-3.5 w-3.5 opacity-70" />
                        <span>{group.label}</span>
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <MobileNavRow key={item.to} item={item} location={location} navBadges={navBadges} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3">
                  <MobileNavRow item={changelogItem} location={location} navBadges={navBadges} subtle />
                </div>
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
  subtle = false,
}: {
  item: NavItem;
  collapsed: boolean;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
  subtle?: boolean;
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
        subtle && !active && "text-white/55 hover:text-white",
        subtle && !collapsed && "text-xs",
      )}
    >
      <span className="relative inline-flex">
        <Icon className={cn(collapsed ? "h-[22px] w-[22px]" : subtle ? "h-3.5 w-3.5" : "h-4 w-4")} />
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
  subtle = false,
}: {
  item: NavItem;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
  subtle?: boolean;
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
          subtle && !active && "text-xs text-white/55",
        )}
      >
        <span className="relative inline-flex">
          <Icon className={cn(subtle ? "h-3.5 w-3.5" : "h-4 w-4")} />
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

function RailItem({
  id,
  label,
  Icon,
  active,
  routeActive = false,
  badge = 0,
  onClick,
}: {
  id: string;
  label: string;
  Icon: any;
  active: boolean;
  routeActive?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-rail-id={id}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium leading-tight transition-colors",
        active
          ? "bg-gradient-to-b from-[hsl(var(--primary)/0.22)] to-[hsl(var(--primary)/0.08)] text-white"
          : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="relative inline-flex">
        <Icon className={cn("h-5 w-5", active && "text-[hsl(var(--primary))]")} />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0b0b14]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="line-clamp-1 text-center">{label}</span>
      {routeActive && !active && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
      )}
      {active && (
        <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[hsl(var(--primary))]" />
      )}
    </button>
  );
}

function RailLink({
  item,
  location,
  badge = 0,
}: {
  item: NavItem;
  location: ReturnType<typeof useLocation>;
  badge?: number;
}) {
  const Icon = item.icon;
  const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  return (
    <NavLink
      to={item.to}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium leading-tight transition-colors",
        active
          ? "bg-gradient-to-b from-[hsl(var(--primary)/0.22)] to-[hsl(var(--primary)/0.08)] text-white"
          : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="relative inline-flex">
        <Icon className={cn("h-5 w-5", active && "text-[hsl(var(--primary))]")} />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0b0b14]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="line-clamp-1 text-center">{item.label}</span>
      {active && (
        <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[hsl(var(--primary))]" />
      )}
    </NavLink>
  );
}

function PanelNavLink({

  item,
  location,
  navBadges,
  subtle = false,
}: {
  item: NavItem;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
  subtle?: boolean;
}) {
  const active = item.to === "/leads"
    ? location.pathname === "/leads"
    : (location.pathname === item.to || location.pathname.startsWith(item.to + "/"));
  const Icon = item.icon;
  const badge = navBadges[item.to] ?? 0;
  return (
    <NavLink
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-[hsl(var(--primary)/0.18)] text-white shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
          : "text-white/75 hover:bg-white/5 hover:text-white",
        subtle && !active && "text-xs text-white/55",
      )}
    >
      <Icon className={cn(subtle ? "h-3.5 w-3.5" : "h-[18px] w-[18px]", active && "text-[hsl(var(--primary))]")} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1.5 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

