import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  message: string;
  count?: number;
  className?: string;
}

export function AlertBanner({ message, count, className }: Props) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive", className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          {count !== undefined && <strong className="mr-1">{count}</strong>}
          {message}
        </span>
      </div>
      <button onClick={() => setOpen(false)} aria-label="Fechar alerta" className="shrink-0 rounded p-1 hover:bg-destructive/20">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
