import { useState } from "react";
import { Bell, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppNotifications } from "@/hooks/useAppNotifications";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function NotificationsBell() {
  const { items, unreadCount, markAllRead, markRead, hrefFor, approveTakeover, denyTakeover } = useAppNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notificações"
          className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="w-[calc(100vw-1.5rem)] max-w-sm p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notificações</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "Tudo em dia"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="h-[min(70vh,28rem)]">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação recente
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const isTakeover = n.type === "lead_takeover_request" && !n.read;
                return (
                  <li key={n.id}>
                    <div
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors",
                        !n.read && "border-l-2 border-primary bg-primary/5"
                      )}
                    >
                      <button
                        onClick={() => {
                          setOpen(false);
                          markRead(n.id);
                          navigate(hrefFor(n));
                        }}
                        className="flex flex-1 items-start gap-3 text-left hover:opacity-80"
                      >
                        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", !n.read ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                          <UserPlus className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-foreground">{n.title}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">{n.body}</span>
                          {isTakeover && (
                            <span className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 rounded-full px-3 text-xs"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); approveTakeover(n); }}
                              >
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-full px-3 text-xs"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); denyTakeover(n); }}
                              >
                                Recusar
                              </Button>
                            </span>
                          )}
                        </span>
                        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
