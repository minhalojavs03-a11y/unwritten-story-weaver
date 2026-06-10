import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, UserPlus, MessageCircle, CheckCircle2 } from "lucide-react";
import { useNotifications, type NotificationItem, type NotificationType } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const config: Record<NotificationType, { varName: string; icon: React.ElementType; label: string }> = {
  new_lead: { varName: "--notification-new-lead", icon: AlertTriangle, label: "Novo lead na fila" },
  lead_assigned: { varName: "--notification-lead-assigned", icon: UserPlus, label: "Lead atribuído a você" },
  new_message: { varName: "--notification-new-message", icon: MessageCircle, label: "Nova mensagem recebida" },
  lead_status: { varName: "--notification-lead-status", icon: CheckCircle2, label: "Status de lead atualizado" },
};

export function TopAlertBanner() {
  const { items, unreadCount } = useNotifications();
  const [index, setIndex] = useState(0);

  const bannerItems = useMemo(() => {
    const source = items.filter((i) => !i.read);
    const pool = source.length > 0 ? source : items;
    // Pega o mais recente de cada tipo para garantir rotação de cores
    const byType = new Map<NotificationType, NotificationItem>();
    for (const it of pool) {
      if (!byType.has(it.type)) byType.set(it.type, it);
    }
    return Array.from(byType.values());
  }, [items]);

  const bannerKey = bannerItems.map((i) => i.id).join(",");

  useEffect(() => {
    setIndex(0);
  }, [bannerKey]);

  useEffect(() => {
    if (bannerItems.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % bannerItems.length);
    }, 12000);
    return () => clearInterval(id);
  }, [bannerItems.length]);

  const current: NotificationItem | undefined = bannerItems[index];
  if (!current) return null;

  const { icon: Icon } = config[current.type] ?? config.new_lead;
  const totalUnread = unreadCount;
  const redVar = "--notification-new-lead";

  return (
    <Link
      to={current.href}
      style={{ backgroundColor: `hsl(var(${redVar}))`, boxShadow: `0 10px 30px -10px hsl(var(${redVar}) / 0.45)` }}
      className={cn(
        "group relative z-50 flex items-center justify-between gap-3 overflow-hidden border-b border-black/10 px-4 py-1.5 text-white sm:py-2 md:sticky md:top-0 md:px-8"
      )}

    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="truncate text-xs font-semibold sm:text-sm">
          <span className="tabular-nums font-bold">{totalUnread > 1 ? `${totalUnread} · ` : ""}</span>
          {current.title}
          <span className="ml-1.5 opacity-90">{current.description.slice(0, 60)}</span>
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-black/5 transition group-hover:text-slate-800 sm:inline-flex">
        Ver agora <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
