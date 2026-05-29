import { useMemo, useState } from "react";
import { PageHeader } from "./PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { History, Search, Sparkles, Bug, Wrench, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

type EntryType = "feature" | "fix" | "improvement" | "security";

type Entry = {
  type: EntryType;
  title: string;
  description: string;
  area: string;
  restricted?: boolean; // visível apenas para owner/supervisor/superadmin
};

type Release = {
  version: string;
  date: string; // ISO yyyy-mm-dd
  summary?: string;
  entries: Entry[];
};

// Histórico técnico — apenas updates concluídos e implantados em produção.
// Novas entradas devem ser adicionadas no TOPO da lista.
const RELEASES: Release[] = [
  {
    version: "1.8.0",
    date: "2026-05-24",
    summary: "Gravações do Google Meet sincronizadas automaticamente do Drive.",
    entries: [
      {
        type: "feature",
        area: "Gravações",
        title: "Importação automática de gravações do Meet via Google Drive",
        description:
          "Nova edge function sync-meet-recordings varre a pasta 'Meet Recordings' do Drive conectado, importa vídeos novos e vincula automaticamente ao lead/agendamento correspondente. Suporta execução por usuário (botão 'Sincronizar Drive') e em background por cron, sem necessidade de ação manual.",
      },
      {
        type: "feature",
        area: "Gravações",
        title: "Botão 'Sincronizar Drive' na página de Gravações",
        description:
          "Disparo manual da sincronização direto da interface, com feedback em tempo real da quantidade de novas gravações importadas.",
      },
      {
        type: "improvement",
        area: "Documentação",
        title: "Histórico de updates passa a refletir todas as entregas do CRM",
        description:
          "A página 'Atualizações' agora é atualizada a cada release implantada, não apenas funcionalidades visuais — inclui integrações, edge functions, automações e correções de backend.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-05-24",
    summary: "Pipeline automático e nova documentação interna.",
    entries: [
      {
        type: "feature",
        area: "Pipeline",
        title: "Movimentação automática de fase via detalhes do lead",
        description:
          "Ao salvar qualificação ou fase em Detalhes (Lista de Leads), o lead é movido automaticamente para a coluna correspondente do pipeline (ex.: Simulação → Agendado, Negociação/Fechamento → Proposta aceita, Pós-venda → Cota vendida, Desqualificado → Perdido).",
      },
      {
        type: "feature",
        area: "IA / WhatsApp",
        title: "Classificação contínua da conversa",
        description:
          "A IA passa a analisar todo o histórico da conversa em cada mensagem recebida e atualiza temperatura, fase do lead, qualificação e status do pipeline automaticamente.",
      },
      {
        type: "feature",
        area: "Documentação",
        title: "Página de Histórico de updates",
        description:
          "Novo item no menu lateral com todas as versões implantadas, separadas por tipo (feature, correção, melhoria, segurança).",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-05-24",
    summary: "Transferência de leads e melhorias na fila.",
    entries: [
      {
        type: "feature",
        area: "Fila de leads",
        title: "Solicitação de transferência entre consultores",
        description:
          "Leads já atribuídos exibem o botão 'Solicitar transferência' em vez de 'Continuar'. O consultor responsável recebe a solicitação inline e decide liberar ou recusar, com atualização em tempo real.",
      },
      {
        type: "feature",
        area: "Fila de leads",
        title: "Visibilidade da fase do lead",
        description:
          "Cada card da fila mostra agora a fase atual do lead (Novo, Agendado, Em negociação etc.) para evitar pedidos duplicados.",
      },
      {
        type: "fix",
        area: "Fila de leads",
        title: "Botão 'Continuar' aparecia para consultor errado",
        description:
          "Corrigida a fonte de verdade da propriedade do lead: agora segue assigned_member_id quando existir e cai para assigned_to apenas como legado.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-05-24",
    summary: "Mídia nas conversas (imagens, vídeos, documentos e áudio).",
    entries: [
      {
        type: "feature",
        area: "Conversas",
        title: "Envio de imagens, vídeos e documentos",
        description:
          "Novo botão de anexo nas conversas: upload para o bucket chat-media e envio via Uazapi /send/media. Suporte a image/*, video/*, PDF, Office, ZIP/RAR, TXT e CSV.",
      },
      {
        type: "feature",
        area: "Conversas",
        title: "Envio de mensagens de áudio",
        description:
          "Quando a instância Uazapi suporta áudio, o consultor pode gravar e enviar mensagens de voz diretamente do chat.",
      },
      {
        type: "improvement",
        area: "Conversas",
        title: "Renderização rica de mídia",
        description:
          "Bolhas de mensagem detectam o tipo de mídia e exibem player de vídeo/áudio, miniatura de imagem ou ícone de documento com link.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05-23",
    summary: "Refino da experiência 'Assumir lead'.",
    entries: [
      {
        type: "improvement",
        area: "Conversas",
        title: "Botão 'Assumir' único, sem exigir mensagem",
        description:
          "Removida a obrigação de enviar mensagem para assumir o atendimento. O clique no botão já vincula o lead ao consultor logado.",
      },
      {
        type: "fix",
        area: "Fila de leads",
        title: "Botão 'Assumir' desaparece para os demais",
        description:
          "Após um consultor assumir o lead, o botão deixa de ser exibido para os outros membros em tempo real.",
      },
      {
        type: "fix",
        area: "IA",
        title: "IA pausa após primeira mensagem do consultor",
        description:
          "Confirmado que o atendimento humano interrompe a IA assim que o lead é assumido por um membro.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-22",
    summary: "Controle de acesso por valor e notificações por tier.",
    entries: [
      {
        type: "feature",
        area: "Equipe",
        title: "Controle de acesso por valor",
        description:
          "Novo controle em tenant_members. Leads acima do valor configurado só podem ser assumidos com permissão especial (owner, supervisor, superadmin).",
        restricted: true,
      },
      {
        type: "feature",
        area: "Notificações",
        title: "Disparo de notificação por tier do lead",
        description:
          "Função notify-consultant-by-tier passa a respeitar o valor do lead ao escolher o consultor a notificar.",
        restricted: true,
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-20",
    summary: "Atribuição de leads por membro do time.",
    entries: [
      {
        type: "feature",
        area: "Leads",
        title: "assigned_member_id e função assume_lead",
        description:
          "Leads agora têm vínculo direto com tenant_members, com função SECURITY DEFINER assume_lead que valida tenant, override de owner/supervisor e valor do lead.",
      },
      {
        type: "feature",
        area: "Leads",
        title: "Liberação controlada via release_lead",
        description:
          "Função release_lead garante que apenas o dono atual ou cargos de supervisão liberem o lead.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-05-15",
    summary: "Agendamentos automáticos via IA.",
    entries: [
      {
        type: "feature",
        area: "Agenda",
        title: "Extração de agendamento da conversa",
        description:
          "A IA detecta data/hora confirmadas com o cliente, cria o appointment automaticamente e move o lead para o estágio 'agendado'.",
      },
      {
        type: "improvement",
        area: "Agenda",
        title: "Janela anti-duplicação de ±2h",
        description:
          "Antes de criar um novo agendamento, o sistema verifica se já existe outro do mesmo lead na janela de 2 horas para evitar duplicidade.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-10",
    summary: "Versão inicial implantada em produção.",
    entries: [
      {
        type: "feature",
        area: "Plataforma",
        title: "CRM multi-tenant com RLS",
        description:
          "Tenants, profiles, user_roles, tenant_members e funções has_role/is_tenant_owner/is_tenant_staff com Row-Level Security em todas as tabelas operacionais.",
      },
      {
        type: "feature",
        area: "WhatsApp",
        title: "Integração Uazapi (whatsapp-webhook)",
        description:
          "Recebimento de mensagens, deduplicação por external_id, sincronização de conversas e disparo de resposta automática via IA.",
      },
      {
        type: "feature",
        area: "IA",
        title: "IA integrada (Gemini 2.5 Flash)",
        description:
          "Respostas automáticas, classificação de leads e sugestões de resposta integradas, sem chave externa.",
      },
      {
        type: "security",
        area: "Segurança",
        title: "Roles em tabela separada",
        description:
          "Implementação do padrão recomendado: tabela user_roles + função has_role SECURITY DEFINER para evitar escalonamento de privilégio.",
      },
    ],
  },
];

const TYPE_META: Record<EntryType, { label: string; icon: typeof Sparkles; className: string }> = {
  feature: {
    label: "Novo recurso",
    icon: Sparkles,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  fix: {
    label: "Correção",
    icon: Bug,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  improvement: {
    label: "Melhoria",
    icon: Wrench,
    className: "bg-info/10 text-info border-info/20",
  },
  security: {
    label: "Segurança",
    icon: ShieldCheck,
    className: "bg-success/10 text-success border-success/20",
  },
};

const FILTERS: Array<{ value: "all" | EntryType; label: string }> = [
  { value: "all", label: "Tudo" },
  { value: "feature", label: "Novidades" },
  { value: "fix", label: "Correções" },
  { value: "improvement", label: "Melhorias" },
  { value: "security", label: "Segurança" },
];

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ChangelogPage() {
  const [filter, setFilter] = useState<"all" | EntryType>("all");
  const [search, setSearch] = useState("");
  const { can } = usePermissions();
  const canSeeRestricted = can("manage_team");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RELEASES.map((r) => ({
      ...r,
      entries: r.entries.filter((e) => {
        if (e.restricted && !canSeeRestricted) return false;
        if (filter !== "all" && e.type !== filter) return false;
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.area.toLowerCase().includes(q) ||
          r.version.includes(q)
        );
      }),
    })).filter((r) => r.entries.length > 0);
  }, [filter, search, canSeeRestricted]);

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Histórico de updates"
        subtitle="Documentação técnica de todas as versões implantadas em produção. Apenas updates concluídos com sucesso são registrados aqui."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por versão, área ou palavra-chave..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma entrada encontrada para os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {filtered.map((release) => (
            <Card key={release.version} className="overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 space-y-0 border-b bg-muted/30">
                <div className="flex items-baseline gap-3">
                  <CardTitle className="text-xl font-bold tracking-tight">
                    v{release.version}
                  </CardTitle>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {formatDate(release.date)}
                  </span>
                </div>
                {release.summary && (
                  <p className="text-xs text-muted-foreground md:text-sm">
                    {release.summary}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4 p-4 md:p-6">
                {release.entries.map((entry, idx) => {
                  const meta = TYPE_META[entry.type];
                  const Icon = meta.icon;
                  return (
                    <div key={idx} className="flex gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                          meta.className,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold leading-tight">
                            {entry.title}
                          </h4>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] font-medium uppercase tracking-wide", meta.className)}
                          >
                            {meta.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-medium">
                            {entry.area}
                          </Badge>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {entry.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Para registrar uma nova versão, edite{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">src/pages/app/ChangelogPage.tsx</code>.
      </p>
    </div>
  );
}
