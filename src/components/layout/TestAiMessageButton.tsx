import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TestAiMessageButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-message");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Mensagem de teste enviada ao 17997091070");
    } catch (err: any) {
      const msg = err?.context
        ? (await err.context.clone().json().catch(() => null))?.error
        : null;
      toast.error(msg || err?.message || "Falha ao enviar mensagem de teste");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={loading}
          className="h-9 gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="hidden text-xs sm:inline">Teste IA</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Enviar mensagem de teste com IA ao 17997091070</TooltipContent>
    </Tooltip>
  );
}
