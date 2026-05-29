import { cn } from "@/lib/utils";

interface Props {
  current: number;
  goal: number;
  label?: string;
  className?: string;
}

export function MonthlyGoalBar({ current, goal, label = "Meta do mês", className }: Props) {
  const safeGoal = Math.max(goal, 0);
  const pct = safeGoal > 0 ? Math.min(100, Math.round((current / safeGoal) * 100)) : 0;
  const done = safeGoal > 0 && current >= safeGoal;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {current}/{safeGoal || "—"}
          {safeGoal > 0 && <span className="ml-1 text-xs">({pct}%)</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all duration-500", done ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
