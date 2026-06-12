/**
 * Catálogo canônico de itens de menu do app cliente.
 * `key` é usado em `menu_permissions.menu_key`.
 * `roles` indica quais cargos NORMALMENTE veem o item (antes do override
 * do superadmin via toggle). Itens fora deste mapa não podem ser ocultados.
 */
import type { MenuRole } from "@/hooks/useMenuPermissions";

export interface MenuCatalogItem {
  key: string;
  label: string;
  roles: MenuRole[]; // cargos onde o item aparece por padrão
}

export const MENU_CATALOG: MenuCatalogItem[] = [
  { key: "/crm",            label: "Início",            roles: ["owner", "supervisor", "consultant"] },
  { key: "/leads/fila",     label: "Fila de leads",     roles: ["owner", "supervisor", "consultant"] },
  { key: "/nilton",         label: "Leads Nilton RS",   roles: ["owner", "supervisor"] },
  { key: "/conversas",      label: "Conversas",         roles: ["owner", "supervisor", "consultant"] },
  { key: "/pipeline",       label: "Pipeline",          roles: ["owner", "supervisor", "consultant"] },
  { key: "/leads",          label: "Leads",             roles: ["owner", "supervisor", "consultant"] },
  { key: "/distribuicao",   label: "Distribuição",      roles: ["owner", "supervisor"] },
  { key: "/agenda",         label: "Agenda",            roles: ["owner", "supervisor", "consultant"] },
  { key: "/meu-whatsapp",   label: "Meu WhatsApp",      roles: ["owner", "supervisor", "consultant"] },
  { key: "/ranking",        label: "Ranking",           roles: ["owner", "supervisor", "consultant"] },
  { key: "/relatorios",     label: "Relatórios",        roles: ["owner", "supervisor", "consultant"] },
  { key: "/coaching",       label: "Coaching IA",       roles: ["owner", "supervisor", "consultant"] },
  { key: "/consultores",    label: "Consultores",       roles: ["owner", "supervisor"] },
  { key: "/equipe",         label: "Equipe",            roles: ["owner", "supervisor"] },
  { key: "/configuracoes",  label: "Configurações",     roles: ["owner", "supervisor", "consultant"] },
];

export const ROLE_LABEL: Record<MenuRole, string> = {
  owner: "Dono",
  supervisor: "Supervisor",
  consultant: "Consultor",
};
