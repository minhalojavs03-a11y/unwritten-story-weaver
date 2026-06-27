import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, MessageCircle, Kanban, Calendar, Users, Settings, LogOut, Shield, Smartphone, Menu, Inbox, User as UserIcon, Users2, ChevronLeft, ChevronRight, Trophy, BarChart3, Target, Repeat, Share2, ChevronDown, Search, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveRole } from "@/hooks/useEffectiveRole";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMyProfile } from "@/hooks/useProfile";
import { useTenantMembers } from "@/hooks/useData";
import { useConversationConsultants } from "@/hooks/useConversationConsultants";
import { useWhatsAppOnline, isWhatsAppOnline } from "@/hooks/useWhatsAppOnline";
import { isOnline } from "@/components/ui/OnlineStatusDot";
import { useUpdateLastSeen } from "@/hooks/useUpdateLastSeen";
import { MemberLoginDialog } from "@/components/MemberLoginDialog";
import { useActiveMember } from "@/contexts/ActiveMemberContext";
import { TopAlertBanner } from "@/components/layout/TopAlertBanner";
import { WhatsAppDisconnectBanner } from "@/components/layout/WhatsAppDisconnectBanner";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { ImpersonateDialog } from "@/components/admin/ImpersonateDialog";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { WhatsAppStatusPill } from "@/components/layout/WhatsAppStatusPill";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useHiddenMenus, type MenuRole } from "@/hooks/useMenuPermissions";
import { useEffect, useMemo, useRef, useState } from "react";

import { TutorialVideoDialog } from "@/components/TutorialVideoDialog";
import logoCatelanWhite from "@/assets/logo-catelan-white.png";
import logoFeraconDark from "@/assets/logo-feracon-dark.png";
import logoFeraconMark from "@/assets/logo-feracon-mark.png";
import logoFeracon from "@/assets/logo-feracon-white.png";

type NavItem = { to: string; label: string; icon: LucideIcon };

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
  const { isSuperadmin: realIsSuperadmin, isOwner: realIsOwner, isSupervisor: realIsSupervisor } = useEffectiveRole();
  const { isSuperadmin: authIsSuperadmin } = useAuth();
  const { data: profile } = useMyProfile();
  const { member, clearMember } = useActiveMember();
  const { data: members = [] } = useTenantMembers();
  useUpdateLastSeen();
  

  // Modo suporte: superadmin visualizando como outro tenant.
  // Enquanto impersonando, esconde menus/atalhos admin e mostra o nome do tenant
  // no cabeçalho, para refletir fielmente a experiência do consultor/dono daquele cliente.
  const [impersonating, setImpersonating] = useState<{ tenant_name: string; target_role?: string | null; target_member_id?: string | null } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("impersonation_context");
      return raw ? (JSON.parse(raw) as { tenant_name: string; target_role?: string | null; target_member_id?: string | null }) : null;
    } catch { return null; }
  });
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("impersonation_context");
        setImpersonating(raw ? (JSON.parse(raw) as { tenant_name: string; target_role?: string | null; target_member_id?: string | null }) : null);
      } catch { setImpersonating(null); }
    };
    window.addEventListener("storage", read);
    window.addEventListener("feracon:impersonation", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("feracon:impersonation", read);
    };
  }, []);

  const isSuperadmin = realIsSuperadmin;
  const isOwner = realIsOwner;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar_collapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0"); } catch { return; }
  }, [collapsed]);
  const isSupervisor = realIsSupervisor;

  // Lista única por papel — só o que realmente importa no dia a dia.
  // Itens menos usados ficam em /configuracoes (Mensagens prontas, Gravações,
  // Treinar IA, Integrações, WhatsApp instâncias, Histórico de updates).
  const profileName = `${(profile?.username ?? "").toLowerCase()} ${(profile?.display_name ?? "").toLowerCase()} ${(profile?.full_name ?? "").toLowerCase()}`;
  const isNilton = /\bnilton\b/.test(profileName);

  const navItems: NavItem[] = useMemo(() => {
    const home: NavItem = { to: "/crm", label: "Início", icon: Home };
    const fila: NavItem = { to: "/leads/fila", label: "Fila de leads", icon: Inbox };
    const nilton: NavItem = { to: "/nilton", label: "Leads Nilton RS", icon: Target };
    const conversas: NavItem = { to: "/conversas", label: "Conversas", icon: MessageCircle };
    const pipeline: NavItem = { to: "/pipeline", label: "Pipeline", icon: Kanban };
    const leads: NavItem = { to: isSupervisor && !isOwner && !isSuperadmin ? "/distribuicao" : "/leads", label: isOwner || isSuperadmin || isSupervisor ? "Leads" : "Meus leads", icon: Users };
    const agenda: NavItem = { to: "/agenda", label: "Agenda", icon: Calendar };
    const ranking: NavItem = { to: "/ranking", label: "Ranking", icon: Trophy };
    const relatorios: NavItem = { to: "/relatorios", label: "Relatórios", icon: BarChart3 };
    const coaching: NavItem = { to: "/coaching", label: "Coaching IA", icon: Target };
    const consultores: NavItem = { to: "/consultores", label: "Consultores", icon: Users2 };
    const equipe: NavItem = { to: "/equipe", label: "Equipe", icon: Users2 };
    const distribuicao: NavItem = { to: "/distribuicao", label: "Distribuição", icon: Share2 };
    const meuWa: NavItem = { to: "/meu-whatsapp", label: "Meu WhatsApp", icon: Smartphone };
    const config: NavItem = { to: "/configuracoes", label: "Configurações", icon: Settings };

    if (impersonating && !isOwner && !isSupervisor) {
      return [home, fila, conversas, pipeline, leads, agenda, meuWa, ranking, relatorios, coaching, config];
    }
    if (isOwner || isSuperadmin) {
      return [home, fila, nilton, conversas, pipeline, leads, agenda, meuWa, ranking, relatorios, coaching, consultores, distribuicao, config];
    }
    if (isSupervisor) {
      return [home, fila, nilton, conversas, pipeline, leads, agenda, meuWa, ranking, relatorios, coaching, consultores, distribuicao, config];
    }
    if (isNilton) {
      return [home, fila, nilton, conversas, pipeline, leads, agenda, meuWa, ranking];
    }
    return [home, fila, conversas, pipeline, leads, agenda, meuWa, ranking, relatorios, coaching];

  }, [isOwner, isSuperadmin, isSupervisor, impersonating, isNilton]);

  // Aplicar overrides do superadmin (Controle de Menus). Superadmin (real, fora
  // de impersonation) nunca tem itens ocultos. Durante impersonation, usamos a
  // role-alvo (target_role) para que o superadmin veja exatamente o menu do
  // cargo impersonado. Sem impersonation, usamos o role_label do membro ativo
  // se houver — assim Antonio (Supervisor) respeita os toggles de supervisor
  // mesmo que `useEffectiveRole` o trate como owner para permissões.
  const memberRoleLabel = (member?.role_label ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const memberMenuRole: MenuRole | null = !member
    ? null
    : /(dono|owner|proprietario)/.test(memberRoleLabel)
      ? "owner"
      : /(supervisor|gerente|gestor)/.test(memberRoleLabel)
        ? "supervisor"
        : "consultant";
  const impersonationTargetRole = (impersonating?.target_role ?? "").toLowerCase();
  const impersonationMenuRole: MenuRole | null = !impersonating
    ? null
    : impersonationTargetRole === "owner"
      ? "owner"
      : impersonationTargetRole === "supervisor"
        ? "supervisor"
        : impersonationTargetRole === "consultant" || impersonationTargetRole === "attendant"
          ? "consultant"
          : memberMenuRole;
  const effectiveMenuRole: MenuRole | null = impersonating
    ? impersonationMenuRole
    : realIsSuperadmin
      ? null
      : memberMenuRole
        ?? (isOwner ? "owner" : isSupervisor ? "supervisor" : "consultant");
  const hiddenMenus = useHiddenMenus(effectiveMenuRole);
  const visibleNavItems = useMemo(() => {
    if (!hiddenMenus.size) return navItems;
    return navItems.filter((it) => !hiddenMenus.has(it.to));
  }, [navItems, hiddenMenus]);



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

  async function exitImpersonation() {
    try {
      const raw = window.localStorage.getItem("impersonation_context");
      const ctx = raw ? (JSON.parse(raw) as { previous_tenant_id: string | null }) : null;
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        await supabase
          .from("profiles")
          .update({ tenant_id: ctx?.previous_tenant_id ?? null, updated_at: new Date().toISOString() })
          .eq("id", u.user.id);
      }
      window.localStorage.removeItem("impersonation_context");
      // Limpa qualquer membro interno selecionado durante o modo suporte
      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) keys.push(k);
        }
        keys.forEach((k) => window.localStorage.removeItem(k));
        const sk: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith("feracon.activeMember")) sk.push(k);
        }
        sk.forEach((k) => window.sessionStorage.removeItem(k));
      } catch { /* ignore */ }
      window.dispatchEvent(new Event("feracon:impersonation"));
      navigate("/admin/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 100);
    } catch (e) {
      console.error("[exitImpersonation]", e);
    }
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[240px]";

  // Superadmin não deve assumir identidade interna de membro — limpa qualquer
  // seleção antiga persistida (ex.: Nilton selecionado em sessão anterior)
  // para evitar que o cabeçalho mostre o nome do membro no lugar do real.
  useEffect(() => {
    if (realIsSuperadmin && !impersonating && member) {
      clearMember();
    }
  }, [realIsSuperadmin, impersonating, member, clearMember]);

  const activeMemberAvatarUrl = member ? (members.find((mm) => mm.id === member.id)?.avatar_url ?? null) : null;
  const realAccountName = profile?.display_name ?? profile?.full_name?.split(" ")[0] ?? profile?.email ?? "Minha conta";
  // Para superadmin (real) o cabeçalho sempre mostra a conta logada; ignora
  // membro interno fora do modo suporte.
  const useRealIdentity = realIsSuperadmin && !impersonating;
  const shownIdentityName = impersonating
    ? realAccountName
    : useRealIdentity
    ? realAccountName
    : (member?.display_name ?? profile?.display_name ?? profile?.full_name?.split(" ")[0] ?? "Perfil");
  const avatarIdentityName = impersonating || useRealIdentity
    ? (profile?.full_name ?? profile?.email ?? "?")
    : (member?.display_name ?? profile?.full_name ?? profile?.email ?? "?");

  return (
    <div className={cn(
      "client-shell flex w-full max-w-full",
      lockViewport ? "h-dvh min-h-0 overflow-hidden" : "min-h-dvh",
    )}>
      {/* Desktop sidebar — lista única */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 self-start md:flex", sidebarWidth, "transition-all")}>
        <TooltipProvider delayDuration={100}>
          <div className="client-sidebar relative flex w-full flex-col border-r border-white/5 py-3">
            <div className={cn("-mt-2 mb-4 flex items-center", collapsed ? "mx-auto h-9 w-9" : "mx-3 h-[58px]")}>
              <button
                type="button"
                onClick={() => navigate("/crm")}
                className={cn("flex flex-1 items-center", collapsed ? "h-9 w-9 justify-center" : "h-[58px] justify-start px-1")}
                aria-label="Início"
              >
                {collapsed ? (
                  <img src={logoFeraconMark} alt="Feracon" className="h-9 w-9 object-contain" />
                ) : (
                  <img src={logoFeracon} alt="Consórcio Feracon" className="h-[58px] w-auto object-contain" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                className={cn(
                  "flex shrink-0 items-center justify-center text-white/50 transition-colors hover:text-white",
                  collapsed ? "h-9 w-9" : "h-[58px] w-8",
                )}
              >
                {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
            </div>

            <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-2" : "px-2")}>
              {visibleNavItems.map((item) => (
                item.to === "/conversas" && (isOwner || isSuperadmin || isSupervisor) ? (
                  <ConversasNavWithSubmenu
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    location={location}
                    navBadges={navBadges}
                    navigate={navigate}
                  />
                ) : (
                  <SidebarNavLink
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    location={location}
                    navBadges={navBadges}
                  />
                )
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

          </div>
        </TooltipProvider>
      </aside>

      {/* Main */}
      <main className={cn(
        "flex min-w-0 flex-1 flex-col pb-16 md:pb-0 bg-[#d11e26] md:bg-transparent",
        lockViewport && "min-h-0 overflow-hidden",
      )}>
        <ImpersonationBanner />
        <WhatsAppDisconnectBanner />
        <TopAlertBanner />
        <div aria-hidden className={cn("h-4 bg-[#d11e26]", isConversasMobile ? "hidden" : "md:hidden")} />
        <header className={cn(
          "client-header sticky top-0 z-40 flex h-14 w-full items-center justify-between px-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] [backdrop-filter:none] md:h-12 md:justify-between md:border-0 md:!bg-transparent md:px-4 md:shadow-none",
          "mx-3 -mt-3 rounded-t-[28px] border border-black/5 !bg-white md:mx-0 md:mt-0 md:rounded-none md:border-b md:border-black/5 md:!bg-white",
          isConversasMobile && "hidden md:flex",
        )}>

          <div className="hidden md:flex min-w-0 flex-1 items-center gap-2 pr-4">
            <HeaderSearch />
            <HeaderQuickActions navigate={navigate} />
          </div>

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
                  {visibleNavItems.map((item) => (
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
          <div className="flex shrink-0 items-center gap-1.5 -mr-1 md:mr-0">
            <MobileSearchTrigger navigate={navigate} />
            <WhatsAppStatusPill />
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-primary">
                <UserAvatar
                  userId={impersonating || useRealIdentity ? profile?.id : (member?.id ?? profile?.id)}
                  name={avatarIdentityName}
                  avatarUrl={impersonating || useRealIdentity ? profile?.avatar_url : (member ? activeMemberAvatarUrl : profile?.avatar_url)}
                  avatarColor={impersonating || useRealIdentity ? profile?.avatar_color : (member?.avatar_color ?? profile?.avatar_color)}
                  size={32}
                />
                <div className="hidden flex-col items-start leading-tight md:flex">
                  <span className="text-sm font-medium text-foreground">
                    {shownIdentityName}
                  </span>
                  {!impersonating && !useRealIdentity && member && (
                    <span className="text-[10px] text-muted-foreground">
                      @{member.username}{member.role_label ? ` · ${member.role_label}` : ""}
                    </span>
                  )}
                  {!impersonating && useRealIdentity && (
                    <span className="text-[10px] text-muted-foreground">Superadmin</span>
                  )}
                  {impersonating && (
                    <span className="max-w-[180px] truncate text-[10px] text-amber-600">
                      Suporte em: {impersonating.tenant_name}
                    </span>
                  )}
                </div>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-52">
                {impersonating && (
                  <>
                    <div className="px-2 py-1.5 text-xs leading-tight">
                      <div className="font-medium text-foreground">Conta logada: {realAccountName}</div>
                      <div className="mt-0.5 text-muted-foreground">Visualizando: {impersonating.tenant_name}</div>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate("/perfil")}>
                  <UserIcon className="mr-2 h-4 w-4" /> Meu perfil
                </DropdownMenuItem>
                {isOwner && (
                  <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
                    <Settings className="mr-2 h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                )}
                {authIsSuperadmin && (
                  <DropdownMenuItem onClick={() => setImpersonateOpen(true)}>
                    <Repeat className="mr-2 h-4 w-4" /> Trocar de conta
                  </DropdownMenuItem>
                )}
                {authIsSuperadmin && impersonating && (
                  <DropdownMenuItem onClick={exitImpersonation} className="text-amber-700 focus:text-amber-700">
                    <Shield className="mr-2 h-4 w-4" /> Voltar ao Superadmin
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
        {mobileNav.filter((it) => !hiddenMenus.has(it.to)).map((item) => {
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

function ConversasNavWithSubmenu({
  item,
  collapsed,
  location,
  navBadges,
  navigate,
}: {
  item: NavItem;
  collapsed: boolean;
  location: ReturnType<typeof useLocation>;
  navBadges: Record<string, number>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { data: members = [], isLoading: loadingMembers } = useConversationConsultants();
  const { data: waOnline } = useWhatsAppOnline();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const openMenu = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  const Icon = item.icon;
  const badge = navBadges[item.to] ?? 0;
  const params = new URLSearchParams(location.search);
  const currentConsultor = params.get("consultor");
  const isOnConversas = active;

  const onPickConsultor = (id: string | null) => {
    setOpen(false);
    const next = new URLSearchParams();
    if (id) next.set("consultor", id);
    navigate(`/conversas${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <div
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <NavLink
        to={item.to}
        className={cn(
          "group relative flex items-center rounded-xl text-sm font-medium transition-all",
          active ? "client-nav-active" : "client-nav-idle",
          collapsed ? "h-11 w-11 justify-center mx-auto" : "gap-3 px-3 py-2.5",
        )}
        onClick={(e) => {
          e.preventDefault();
          if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
          setOpen((v) => !v);
        }}
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
        {!collapsed && (
          <span className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-white/60 group-hover:bg-white/10 group-hover:text-white">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </span>
        )}
        {!collapsed && badge > 0 && !open && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--notification-new-lead))] px-1.5 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </NavLink>

      {open && (
        <div
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          className={cn(
            "z-50 rounded-xl border border-white/10 bg-[hsl(222_47%_13%)] p-1.5 shadow-xl",
            collapsed ? "absolute left-full top-0 ml-2 w-64" : "mt-1 w-full",
          )}
        >
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Conversas por consultor
          </div>


          <div className="max-h-80 overflow-y-auto">
            {loadingMembers && (
              <div className="px-2 py-2 text-xs text-white/50">Carregando consultores…</div>
            )}
            {!loadingMembers && members.length === 0 && (
              <div className="px-2 py-2 text-xs text-white/50">Nenhum consultor cadastrado.</div>
            )}
            {members.map((m) => {
              const isActive = isOnConversas && currentConsultor === m.id;
              const sysOn = isOnline(m.last_seen_at);
              const waOn = isWhatsAppOnline(waOnline, m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPickConsultor(m.id)}
                  title={`Sistema: ${sysOn ? "online" : "offline"} · WhatsApp: ${waOn ? "conectado" : "desconectado"}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <UserAvatar
                    userId={m.id}
                    name={m.display_name || m.full_name || "?"}
                    avatarUrl={m.avatar_url}
                    avatarColor={m.avatar_color}
                    size={24}
                  />
                  <span className="min-w-0 flex-1 truncate">{m.display_name || m.full_name || "Sem nome"}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      title={`Sistema ${sysOn ? "online" : "offline"}`}
                      className={cn("h-1.5 w-1.5 rounded-full", sysOn ? "bg-emerald-400" : "bg-white/20")}
                    />
                    <span
                      title={`WhatsApp ${waOn ? "conectado" : "desconectado"}`}
                      className={cn("h-1.5 w-1.5 rounded-full", waOn ? "bg-emerald-400 ring-1 ring-emerald-300/50" : "bg-white/20")}
                    />
                  </span>
                  {m.role_label && (
                    <span className="shrink-0 text-[10px] text-white/40">{m.role_label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileSearchTrigger({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Pesquisar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <Search className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="top" className="flex h-auto flex-col gap-3 px-4 pb-6 pt-4">
        <SheetHeader className="sr-only">
          <SheetTitle>Buscar</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            if (!term) return;
            setOpen(false);
            navigate(`/leads?q=${encodeURIComponent(term)}`);
          }}
          className="relative flex items-center"
        >
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Buscar leads, conversas, contatos…"
            autoFocus
            className="h-11 w-full rounded-full border border-border/60 bg-muted/40 pl-10 pr-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-background"
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (!term) return;
        navigate(`/leads?q=${encodeURIComponent(term)}`);
      }}
      className="relative flex flex-1 items-center"
    >
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder="Buscar leads, conversas, contatos…"
        className="h-9 w-full rounded-full border border-border/60 bg-muted/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-background"
      />
    </form>
  );
}

function HeaderQuickActions({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const items: { to: string; label: string; icon: LucideIcon }[] = [
    { to: "/leads/fila", label: "Fila de leads", icon: Inbox },
    { to: "/agenda", label: "Agenda", icon: Calendar },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    { to: "/configuracoes", label: "Configurações", icon: Settings },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1">
      <TooltipProvider delayDuration={150}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Tooltip key={it.to}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={it.label}
                  onClick={() => navigate(it.to)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{it.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
      <button
        type="button"
        onClick={() => navigate("/leads?novo=1")}
        className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden lg:inline">Novo lead</span>
      </button>
    </div>
  );
}

