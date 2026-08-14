import { cn } from "@/lib/utils";

export type AppRole = "superadmin" | "owner" | "supervisor" | "consultant" | "attendant" | "support";

const ROLE_CONFIG: Record<AppRole, { label: string; bg: string; text: string }> = {
  superadmin: { label: "Super Admin",    bg: "#1E1B4B", text: "#A5B4FC" },
  owner:      { label: "Dono da Unidade",bg: "#1C1917", text: "#FCD34D" },
  supervisor: { label: "Supervisor",     bg: "#14532D", text: "#86EFAC" },
  consultant: { label: "Consultor",      bg: "#1E3A5F", text: "#93C5FD" },
  attendant:  { label: "Atendente",      bg: "#3B1F2B", text: "#F9A8D4" },
  support:    { label: "Suporte técnico",bg: "#0F2A2E", text: "#5EEAD4" },
};

interface RoleBadgeProps {
  role: AppRole;
  customLabel?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export function RoleBadge({ role, customLabel, className, size = "md" }: RoleBadgeProps) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.consultant;
  const label = customLabel?.trim() || cfg.label;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {label}
    </span>
  );
}

export const ROLE_LABELS = ROLE_CONFIG;
