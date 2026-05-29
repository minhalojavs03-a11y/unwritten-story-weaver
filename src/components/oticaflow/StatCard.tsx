import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: number;
  iconColor?: string;
  className?: string;
  variant?: "light" | "dark";
  to?: string;
}

export function StatCard({ icon: Icon, label, value, trend, iconColor, className, variant = "light", to }: Props) {
  const isDark = variant === "dark";
  const defaultIcon = isDark
    ? "bg-[hsl(217_91%_60%/0.15)] text-[hsl(217_91%_70%)]"
    : "bg-primary-light text-primary";
  const Wrapper: any = to ? Link : "div";
  const wrapperProps = to ? { to } : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        isDark ? "admin-stat rounded-xl p-3 md:rounded-2xl md:p-5" : "client-stat rounded-xl p-3 md:rounded-2xl md:p-5",
        to && "block cursor-pointer transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.03] md:h-11 md:w-11 md:rounded-xl", iconColor ?? defaultIcon)}>
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        {typeof trend === "number" && (
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium md:text-xs", trend >= 0 ? "text-success" : "text-destructive")}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend > 0 ? "+" : ""}{trend} vs ontem
          </span>
        )}
      </div>
      <div className="mt-2 md:mt-4">
        <div className={cn("font-display font-bold tracking-tight text-2xl md:text-4xl", isDark ? "text-white" : "text-foreground")}>{value}</div>
        <div className={cn("text-xs md:text-sm", isDark ? "text-white/50" : "text-muted-foreground")}>{label}</div>
      </div>
    </Wrapper>
  );
}
