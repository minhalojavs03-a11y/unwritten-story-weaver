import { cn } from "@/lib/utils";

export function isOnline(lastSeenAt?: string | null, thresholdMinutes = 5) {
  if (!lastSeenAt) return false;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff < thresholdMinutes * 60 * 1000;
}

export function formatLastSeen(lastSeenAt?: string | null) {
  if (!lastSeenAt) return "Nunca acessou";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "Online agora";
  if (mins < 60) return `Visto há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Visto há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Visto há ${days}d`;
  return new Date(lastSeenAt).toLocaleDateString("pt-BR");
}

export function OnlineStatusDot({
  lastSeenAt, className, withLabel = false,
}: { lastSeenAt?: string | null; className?: string; withLabel?: boolean }) {
  const online = isOnline(lastSeenAt);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className="relative inline-flex h-2.5 w-2.5">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            online ? "bg-emerald-500" : "bg-slate-300",
          )}
        />
      </span>
      {withLabel && (
        <span className={online ? "text-emerald-700 font-medium" : "text-muted-foreground"}>
          {formatLastSeen(lastSeenAt)}
        </span>
      )}
    </span>
  );
}
