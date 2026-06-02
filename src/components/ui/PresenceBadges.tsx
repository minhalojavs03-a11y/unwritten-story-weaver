import { cn } from "@/lib/utils";
import { isOnline, formatLastSeen } from "./OnlineStatusDot";
import { MessageCircle, Monitor } from "lucide-react";

type Props = {
  lastSeenAt?: string | null;
  whatsappOnline?: boolean;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Mostra dois indicadores lado a lado:
 *  - Sistema (CRM web/app)
 *  - WhatsApp (instância conectada)
 * Cada um pode estar online (verde) ou offline (cinza).
 */
export function PresenceBadges({ lastSeenAt, whatsappOnline, className, size = "sm" }: Props) {
  const systemOnline = isOnline(lastSeenAt);
  const sys = systemOnline
    ? { dot: "bg-emerald-500", text: "text-emerald-700", label: "Sistema" }
    : { dot: "bg-slate-300", text: "text-muted-foreground", label: "Sistema" };
  const wa = whatsappOnline
    ? { dot: "bg-emerald-500", text: "text-emerald-700", label: "WhatsApp" }
    : { dot: "bg-slate-300", text: "text-muted-foreground", label: "WhatsApp" };
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span
        title={systemOnline ? `Online no sistema · ${formatLastSeen(lastSeenAt)}` : `Sistema offline · ${formatLastSeen(lastSeenAt)}`}
        className={cn("inline-flex items-center gap-1 rounded-full border bg-muted/40", pad, sys.text)}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", sys.dot)} />
        <Monitor className="h-3 w-3" />
        <span>{sys.label}</span>
      </span>
      <span
        title={whatsappOnline ? "WhatsApp conectado" : "WhatsApp desconectado"}
        className={cn("inline-flex items-center gap-1 rounded-full border bg-muted/40", pad, wa.text)}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", wa.dot)} />
        <MessageCircle className="h-3 w-3" />
        <span>{wa.label}</span>
      </span>
    </div>
  );
}

export function presenceSummary(lastSeenAt?: string | null, whatsappOnline?: boolean) {
  const sys = isOnline(lastSeenAt);
  if (sys && whatsappOnline) return "Online no sistema e WhatsApp";
  if (sys) return "Online no sistema";
  if (whatsappOnline) return "Online no WhatsApp";
  return formatLastSeen(lastSeenAt);
}
