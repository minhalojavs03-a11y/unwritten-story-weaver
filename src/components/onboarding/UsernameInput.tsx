import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UsernameInputProps {
  value: string;
  onChange: (v: string) => void;
  onValidityChange?: (valid: boolean) => void;
}

type State = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

const RE = /^[a-z0-9_]{3,20}$/;

export function UsernameInput({ value, onChange, onValidityChange }: UsernameInputProps) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (!value) {
      setState("idle");
      onValidityChange?.(false);
      return;
    }
    if (!RE.test(value)) {
      setState("invalid");
      onValidityChange?.(false);
      return;
    }
    setState("checking");
    onValidityChange?.(false);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("check_username_available", { _username: value });
        if (error) throw error;
        if (data === true) {
          setState("available");
          onValidityChange?.(true);
        } else {
          setState("taken");
          onValidityChange?.(false);
        }
      } catch {
        setState("error");
        onValidityChange?.(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [value, onValidityChange]);

  return (
    <div className="space-y-1.5">
      <div className={cn(
        "flex items-center gap-2 rounded-xl border-2 bg-background px-3 transition-colors",
        state === "available" && "border-emerald-500/60",
        state === "taken" && "border-destructive/60",
        state === "invalid" && "border-destructive/40",
        (state === "idle" || state === "checking") && "border-input focus-within:border-primary",
      )}>
        <span className="text-lg font-semibold text-muted-foreground">@</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
          placeholder="maria"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/50"
        />
        <span className="flex h-5 w-5 items-center justify-center">
          {state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {state === "available" && <Check className="h-4 w-4 text-emerald-500" />}
          {(state === "taken" || state === "invalid") && <X className="h-4 w-4 text-destructive" />}
        </span>
      </div>
      <p className={cn(
        "text-xs",
        state === "available" && "text-emerald-600 dark:text-emerald-400",
        (state === "taken" || state === "invalid" || state === "error") && "text-destructive",
        (state === "idle" || state === "checking") && "text-muted-foreground",
      )}>
        {state === "idle" && "3 a 20 caracteres. Letras minúsculas, números e _"}
        {state === "checking" && "Verificando…"}
        {state === "available" && `@${value} está disponível!`}
        {state === "taken" && `@${value} já está em uso nesta loja`}
        {state === "invalid" && "Use apenas letras minúsculas, números e underscore (3–20 caracteres)"}
        {state === "error" && "Não foi possível verificar agora. Tente novamente."}
      </p>
    </div>
  );
}
