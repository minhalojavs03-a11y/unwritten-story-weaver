import { cn } from "@/lib/utils";
import { tempEmoji, tempLabels, type Temperature } from "@/data/mock";

interface Props {
  temperature: Temperature | string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}

export function TempBadge({ temperature: t, className, size = "sm" }: Props) {
  const temperature: Temperature = (t === "hot" || t === "warm" || t === "cold") ? t : "cold";
  const styles: Record<Temperature, string> = {
    hot: "bg-hot-bg text-hot border-hot/20",
    warm: "bg-warm-bg text-warm border-warm/20",
    cold: "bg-cold-bg text-cold border-cold/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        styles[temperature],
        temperature === "hot" && "animate-pulse-hot",
        className,
      )}
    >
      <span aria-hidden>{tempEmoji[temperature]}</span>
      {tempLabels[temperature]}
    </span>
  );
}
