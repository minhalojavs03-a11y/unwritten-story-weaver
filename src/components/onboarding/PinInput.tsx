import { useRef, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function PinInput({ length = 4, value, onChange, autoFocus, ariaLabel = "PIN" }: PinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigit = (i: number, digit: string) => {
    const chars = value.padEnd(length, " ").split("");
    chars[i] = digit;
    onChange(chars.join("").replace(/ /g, "").slice(0, length));
  };

  const handleChange = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(-1);
    if (!v) return;
    setDigit(i, v);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        const chars = value.split("");
        chars[i] = "";
        onChange(chars.join(""));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        const chars = value.split("");
        chars[i - 1] = "";
        onChange(chars.join(""));
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel}>
      {Array.from({ length }).map((_, i) => {
        const filled = !!value[i];
        return (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={value[i] ?? ""}
            onChange={handleChange(i)}
            onKeyDown={handleKey(i)}
            onPaste={handlePaste}
            autoFocus={autoFocus && i === 0}
            className={cn(
              "h-14 w-12 rounded-xl border-2 bg-background text-center text-2xl font-bold transition-all",
              "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
              filled ? "border-primary/60" : "border-input",
            )}
          />
        );
      })}
    </div>
  );
}
