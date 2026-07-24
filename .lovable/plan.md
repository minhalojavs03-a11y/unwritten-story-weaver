# Plano de mudanças

## 1. Unificar "Leads" e "Fila de Leads"
- Manter a rota `/crm/leads` como página única. Mover as funções relevantes de `FilaLeadsPage.tsx` (fila/pendências, priorização) para dentro de `LeadsPage.tsx` como uma aba/toggle no topo: **Todos** · **Aguardando atendimento** (fila).
- Remover a entrada "Fila de Leads" do menu (`src/lib/menuCatalog.ts`) e redirecionar `/crm/fila` → `/crm/leads?view=fila` em `App.tsx`.
- Preservar filtros existentes (período, origem, busca, consultor para gestores).

## 2. Anotação simplificada em todos os leads
Ao clicar em qualquer lead (drawer/detalhe), mostrar apenas um bloco compacto:
- **Select "Status do atendimento"** com opções:
  1. Simulação enviada 1
  2. Simulação enviada 2
  3. Simulação enviada 3
  4. Simulação enviada 4
  5. Reunião
  6. Fechou
  7. Não fechou
- Se selecionar **Não fechou** → abrir campo de texto obrigatório "Por que não fechou?"
- Se **Fechou** → move lead para `stage=comprou`, `status=won`.
- Se **Reunião** → `stage=compareceu`.
- Simulação 1-4 → `stage=agendado` e registra contador em campo `simulation_count` (1..4).
- Não fechou → `stage=perdido`, `status=lost`, grava motivo em `disqualification_reason`/`notes`.
- Remover do drawer os selects complexos atuais (qualificação, fase, oportunidade, tipo de bem, valor da carta, tentativas de contato, próximo follow-up). Manter só o card simplificado + botão salvar.

Backend:
- Migration adiciona coluna `simulation_count int default 0` em `leads` (se não existir) + grants padrão já presentes.
- Atualiza `computeStageFromDetails` e a lógica de salvamento para consumir o novo select.

## 3. Métricas só via anotação — remover "imagem = simulação enviada"
- Auditar e desativar qualquer heurística que marque simulação enviada automaticamente ao detectar imagem/mídia:
  - `supabase/functions/whatsapp-webhook/index.ts` — quando `messageType === 'image'` não incrementa nem marca `simulation_sent`/`points_simulation_sent`.
  - `supabase/functions/classify-lead/index.ts` — remover regra que promove fase para `simulacao` só por imagem.
  - `coaching_insights` do tipo `simulation_sent` passam a ser gerados **somente** quando o consultor salva o novo select de Simulação 1-4 (via trigger/insert no `saveDetail`).
- Confirmar que dashboards/ranking (`useTeamFunnel`, `useReportData`, `MyCoachingPanel`) continuam lendo `coaching_insights.insight_type='simulation_sent'` — a origem muda, o consumo permanece.

## 4. Supervisor vê chat dos consultores (somente leitura) — corrigir de vez
Situação atual: em `ConversasPage.tsx`, `useEffectiveRole` já torna o input somente leitura para supervisores, mas ao clicar em um consultor na lateral a conversa não abre / lista fica vazia.
- Auditar filtro de `conversations` para supervisor: garantir que `canViewAll` inclua `isSupervisor` em todos os pontos (lista lateral por consultor + fetch de mensagens).
- Ao selecionar consultor no painel de gestão, aplicar filtro `assigned_member_id=<consultor>` e permitir abrir mesmo que a conversa não pertença ao supervisor.
- Melhorar o card "Modo supervisão — somente leitura" para deixar claro que é possível ler tudo, mas não enviar.
- Testar em preview com Playwright impersonando Antonio (supervisor) e clicando em consultores diferentes.

## Detalhes técnicos
- **Arquivos principais**: `src/pages/app/LeadsPage.tsx`, `src/pages/app/FilaLeadsPage.tsx` (remover/re-export), `src/pages/app/ConversasPage.tsx`, `src/lib/menuCatalog.ts`, `src/App.tsx`, `src/hooks/useData.ts` (conversations filter), `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/classify-lead/index.ts`.
- **Migration**: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS simulation_count int NOT NULL DEFAULT 0;` (sem novos GRANTs — tabela já existe).
- **Não altera** distribuição de leads, regras da Renata, prioridade Micaelly/Diéssica/David.
- **Verificação**: build + typecheck + Playwright headless para o fluxo do supervisor.
