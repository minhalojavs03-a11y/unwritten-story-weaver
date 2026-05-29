import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="client-page-header sticky top-0 z-[5] mx-3 flex flex-wrap items-end justify-between gap-2 border-x border-b-0 border-black/5 px-5 py-4 ![background:#fff] [backdrop-filter:none] md:mx-0 md:border-x-0 md:border-b md:px-8 md:py-3 md:![background:linear-gradient(180deg,hsl(0_0%_100%/0.9),hsl(210_40%_99%/0.6))] md:[backdrop-filter:blur(10px)]">
      <div className="min-w-0 flex-1 max-w-xl">
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs md:text-sm text-muted-foreground line-clamp-3 pr-4">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}
