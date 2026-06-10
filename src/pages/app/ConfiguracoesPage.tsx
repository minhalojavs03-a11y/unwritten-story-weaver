import { useEffect, useState } from "react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Smartphone, AlertCircle, CheckCircle2, ArrowRight, KeyRound, MessageSquareText, Video, Sparkles, History, Plug, Users2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAiConfig, useMyTenant, useUpdateAiConfig, useWhatsAppInstance } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

export default function ConfiguracoesPage() {
  const { isOwner } = useAuth();
  const { can } = usePermissions();
  const canManageTeam = can("manage_team");
  const { data: tenant } = useMyTenant();
  const { data: ai } = useAiConfig();
  const { data: wa } = useWhatsAppInstance();
  const updateAi = useUpdateAiConfig();

  const [storeName, setStoreName] = useState("");
  const [tone, setTone] = useState("amigavel");
  const [prompt, setPrompt] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => { if (tenant) setStoreName(tenant.name); }, [tenant]);
  useEffect(() => {
    if (ai) {
      setTone(ai.tone ?? "amigavel");
      setPrompt(ai.system_prompt ?? "");
      setEnabled(ai.enabled ?? true);
    }
  }, [ai]);

  async function saveAll() {
    try {
      if (tenant && storeName !== tenant.name && isOwner) {
        const { error } = await supabase.from("tenants").update({ name: storeName }).eq("id", tenant.id);
        if (error) throw error;
      }
      await updateAi.mutateAsync({ tone, system_prompt: prompt, enabled });
      toast({ title: "Configurações salvas" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Ajuste sua loja" />
      <div className="space-y-4 p-3 md:space-y-6 md:p-8">
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-4 md:p-6">
            <h2 className="mb-3 font-display text-base font-semibold md:mb-4 md:text-lg">Sua loja</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Nome da loja</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} disabled={!isOwner} /></div>
              <div className="space-y-1.5"><Label>Plano</Label><Input value={tenant?.plan ?? ""} disabled /></div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-6">
            <h2 className="mb-3 font-display text-base font-semibold md:mb-4 md:text-lg">WhatsApp</h2>
            <Link to="/whatsapp" className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50 md:p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${wa?.status === "connected" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{wa?.phone_number ?? "Conectar WhatsApp"}</div>
                  <div className={`flex items-center gap-1 text-xs ${wa?.status === "connected" ? "text-success" : "text-warning"}`}>
                    {wa?.status === "connected"
                      ? <><CheckCircle2 className="h-3 w-3" /> Conectado</>
                      : <><AlertCircle className="h-3 w-3" /> {wa ? wa.status : "Não conectado"}</>}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-6">
            <h2 className="mb-3 font-display text-base font-semibold md:mb-4 md:text-lg">Acessos</h2>
            <Link to="/configuracoes/acessos" className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50 md:p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">Senhas e usuários</div>
                  <div className="text-xs text-muted-foreground">Instagram, e-mails e acessos do CRM</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-6">
            <h2 className="mb-3 font-display text-base font-semibold md:mb-4 md:text-lg">Mais</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {canManageTeam && <ShortcutLink to="/equipe" icon={Users2} title="Equipe" desc="Membros, convites e metas" />}
              <ShortcutLink to="/mensagens-prontas" icon={MessageSquareText} title="Mensagens prontas" desc="Templates de WhatsApp" />
              <ShortcutLink to="/gravacoes" icon={Video} title="Gravações" desc="Vídeos de simulações" />
              {isOwner && <ShortcutLink to="/treinar-ia" icon={Sparkles} title="Treinar IA" desc="Base de conhecimento" />}
              {isOwner && <ShortcutLink to="/integracoes" icon={Plug} title="Integrações" desc="Google, Sheets, Meta" />}
              <ShortcutLink to="/changelog" icon={History} title="Histórico de updates" desc="Novidades do CRM" />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-6 lg:col-span-2">
            <h2 className="mb-3 font-display text-base font-semibold md:mb-4 md:text-lg">Assistente IA</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">Resposta automática ativa</div>
                    <div className="text-xs text-muted-foreground">A IA responde leads novos antes de você</div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!isOwner} className="shrink-0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tom da conversa</Label>
                  <select value={tone} onChange={(e) => setTone(e.target.value)} disabled={!isOwner}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="amigavel">Amigável</option>
                    <option value="profissional">Profissional</option>
                    <option value="casual">Casual</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Instruções para a IA</Label>
                <Textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!isOwner} className="h-full min-h-[180px]" />
              </div>
            </div>
          </section>
        </div>

        {isOwner && <Button onClick={saveAll} disabled={updateAi.isPending}>Salvar alterações</Button>}
      </div>
    </>
  );
}

function ShortcutLink({ to, icon: Icon, title, desc }: { to: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
