import { useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function AdminIA() {
  const [testMessage, setTestMessage] = useState("Oi, vi a propaganda do consórcio de imóvel. Qual o valor da carta e da parcela? Tenho interesse em comprar minha casa.");
  const [result, setResult] = useState<{ temperature: string; reasoning: string; suggested_reply: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function classify() {
    setLoading(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("classify-lead", { body: { message: testMessage } });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <>
      <AdminHeader title="Assistente IA" subtitle="Teste a classificação de leads em tempo real" />
      <div className="space-y-6 p-4 md:max-w-3xl md:p-8">
        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-1 font-display text-lg font-semibold">Testar classificação</h2>
          <p className="mb-4 text-sm text-muted-foreground">A IA roda em nuvem (Gemini Flash) e classifica a temperatura do lead com base na mensagem.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mensagem do cliente (simulada)</Label>
              <Textarea rows={4} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
            </div>
            <Button onClick={classify} disabled={loading || !testMessage.trim()}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analisando…</> : <><Sparkles className="mr-2 h-4 w-4" />Classificar</>}
            </Button>
          </div>
          {result && (
            <div className="mt-5 space-y-3 rounded-lg border border-primary/20 bg-primary-light/30 p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Temperatura</div>
                <div className="mt-1 text-lg font-bold capitalize">
                  {result.temperature === "hot" ? "🔥 Quente" : result.temperature === "warm" ? "🌡 Morno" : "🧊 Frio"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Por quê</div>
                <p className="mt-1 text-sm">{result.reasoning}</p>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Resposta sugerida</div>
                <p className="mt-1 rounded-lg bg-card p-3 text-sm">{result.suggested_reply}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
