import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLeadSearch } from "@/hooks/useLeadSearch";
import { displayPhone, useCanViewLeadPhone } from "@/lib/leadPrivacy";
import { cn } from "@/lib/utils";

/**
 * Barra de busca global no cabeçalho: encontra qualquer cliente/lead do
 * escopo do usuário por nome, telefone ou e-mail — inclusive registros
 * antigos que não estão na lista carregada da página.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canViewPhone = useCanViewLeadPhone();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: results = [], isFetching } = useLeadSearch(debounced);
  const showPanel = open && debounced.trim().length >= 2;

  function goToLead(id: string) {
    setOpen(false);
    setTerm("");
    navigate(`/leads?lead=${id}&q=${encodeURIComponent(debounced.trim())}`);
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && term.trim()) {
            setOpen(false);
            navigate(`/leads?q=${encodeURIComponent(term.trim())}`);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Buscar cliente por nome, telefone ou e-mail…"
        className="h-9 rounded-full border-border/60 bg-card pl-9 pr-9 text-sm shadow-sm focus-visible:ring-primary/40"
        inputMode="search"
        autoComplete="off"
        aria-label="Buscar cliente"
      />
      {term && (
        <button
          type="button"
          onClick={() => { setTerm(""); setOpen(false); }}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-y-auto rounded-2xl border bg-popover p-1 shadow-xl">
          {isFetching && results.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          )}
          {results.map((lead: any) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => goToLead(lead.id)}
              className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{lead.name || "Sem nome"}</span>
              <span className="text-xs text-muted-foreground">
                {displayPhone(lead.phone, canViewPhone(lead))}
                {lead.email ? ` · ${lead.email}` : ""}
                {lead.created_at ? ` · ${new Date(lead.created_at).toLocaleDateString("pt-BR")}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
