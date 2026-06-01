import { Link } from "react-router-dom";
import { Smartphone, ArrowRight } from "lucide-react";
import { useWhatsAppInstance } from "@/hooks/useData";

function formatSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function WhatsAppDisconnectBanner() {
  const { data: wa, isLoading } = useWhatsAppInstance();
  if (isLoading || !wa) return null;

  const connected = wa.is_connected === true || wa.status === "connected";
  if (connected) return null;

  const since = formatSince(wa.last_connection_at);

  return (
    <Link
      to="/whatsapp"
      className="group sticky top-0 z-50 flex items-center justify-between gap-3 overflow-hidden border-b border-black/10 bg-warning px-4 py-1.5 text-warning-foreground sm:py-2 md:px-8"
      style={{ boxShadow: "0 10px 30px -10px hsl(var(--warning) / 0.45)" }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15 ring-1 ring-black/20">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="absolute inset-1 animate-ping rounded-full bg-black/20" />
        </span>
        <p className="truncate text-xs font-semibold sm:text-sm">
          WhatsApp desconectado
          <span className="ml-1.5 font-normal opacity-90">
            {since ? `· última conexão ${since}. ` : "· "}
            Reconecte para não perder mensagens (WhatsApp apaga após 7 dias).
          </span>
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-black/85 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white ring-1 ring-black/10 transition group-hover:bg-black sm:inline-flex">
        Reconectar <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
