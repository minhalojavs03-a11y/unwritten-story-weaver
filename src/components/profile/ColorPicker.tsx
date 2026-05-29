import { AVATAR_PALETTE } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {AVATAR_PALETTE.map((color) => {
        const active = value?.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Cor ${color}`}
            aria-pressed={active}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition-transform",
              active ? "scale-110 ring-2 ring-foreground" : "hover:scale-105",
            )}
            style={{ backgroundColor: color }}
          >
            {active && <Check className="h-4 w-4 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
