import { useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { Switch } from "@/components/ui/switch";
import { MENU_CATALOG, ROLE_LABEL } from "@/lib/menuCatalog";
import { useMenuPermissions, useToggleMenuPermission, type MenuRole } from "@/hooks/useMenuPermissions";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLES: MenuRole[] = ["owner", "supervisor", "consultant"];

export default function AdminMenus() {
  const [activeRole, setActiveRole] = useState<MenuRole>("consultant");
  const { data: perms = [], isLoading } = useMenuPermissions();
  const toggle = useToggleMenuPermission();

  const hiddenSet = new Set(
    perms.filter((p) => p.role === activeRole && p.hidden).map((p) => p.menu_key),
  );

  const items = MENU_CATALOG.filter((m) => m.roles.includes(activeRole));

  async function handleToggle(menu_key: string, currentlyHidden: boolean) {
    try {
      await toggle.mutateAsync({ role: activeRole, menu_key, hidden: !currentlyHidden });
      toast({
        title: !currentlyHidden ? "Menu ocultado" : "Menu liberado",
        description: `${menu_key} · ${ROLE_LABEL[activeRole]}`,
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col">
      <AdminHeader title="Controle de Menus" subtitle="Mostre ou oculte itens do menu por cargo" />
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setActiveRole(r)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition",
                activeRole === r
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02]">
          <div className="border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-white/50">
            Menus visíveis para <span className="font-semibold text-white/80">{ROLE_LABEL[activeRole]}</span>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-white/60">Carregando…</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((item) => {
                const isHidden = hiddenSet.has(item.key);
                return (
                  <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{item.label}</div>
                      <div className="truncate text-xs text-white/40">{item.key}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs", isHidden ? "text-rose-300" : "text-emerald-300")}>
                        {isHidden ? "Oculto" : "Visível"}
                      </span>
                      <Switch
                        checked={!isHidden}
                        onCheckedChange={() => handleToggle(item.key, isHidden)}
                        disabled={toggle.isPending}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-white/40">
          Quando um menu está oculto, ele desaparece da barra lateral e do menu inferior mobile
          para todos os usuários daquele cargo. Superadmin sempre vê tudo.
        </p>
      </div>
    </div>
  );
}
