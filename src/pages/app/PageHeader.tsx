import type { ReactNode } from "react";
import { useRegisterPageHeader } from "@/contexts/PageHeaderContext";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  // Em md+ o título/subtítulo são exibidos no topbar (mesma linha do perfil/sino).
  // No mobile, mantemos o bloco completo. Em desktop, mostramos somente as ações (se houver).
  useRegisterPageHeader({ title, subtitle });

  return (
    <>
      {/* Mobile: bloco completo */}
      <div className="client-page-header sticky top-0 z-[5] mx-3 flex flex-wrap items-end justify-between gap-2 border-x border-b-0 border-black/5 px-5 py-4 ![background:#fff] [backdrop-filter:none] md:hidden">
        <div className="min-w-0 flex-1 max-w-xl">
          <h1 className="font-display text-xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3 pr-4">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
      </div>

      {/* Desktop: somente ações (título vai no topbar via context) */}
      {actions && (
        <div className="hidden md:flex sticky top-12 z-[5] items-center justify-end gap-2 border-b border-black/5 px-8 py-2 bg-white/70 [backdrop-filter:blur(10px)]">
          {actions}
        </div>
      )}
    </>
  );
}
