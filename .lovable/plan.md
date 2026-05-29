
# Ranking & Gamificação Comercial — Feracon CRM

Módulo 100% aditivo. Nenhuma página, hook, tabela ou fluxo existente será alterado. Toda pontuação é derivada de ações que já existem no CRM (leads, appointments, messages, meeting_recordings).

---

## 1. Banco de dados (migração nova, escalável)

Tabelas novas em `public`, todas com RLS por `tenant_id` seguindo o padrão `is_tenant_staff` / `is_tenant_owner` / `is_superadmin`.

- **gamification_config** (1 linha por tenant)
  - pontos configuráveis: `points_lead_assumed`, `points_contact_made`, `points_meeting_scheduled`, `points_sale_closed`, `points_fast_response_bonus`, `points_lead_lost`, `fast_response_threshold_seconds`
  - níveis JSONB: `levels` (bronze/prata/ouro/diamante com thresholds)
  - `commission_per_sale` (estimativa)
- **gamification_events** (log imutável de eventos pontuados)
  - `tenant_id`, `member_id`, `lead_id?`, `appointment_id?`, `event_type` (enum-text), `points`, `occurred_at`, `metadata jsonb`
  - índices: `(tenant_id, member_id, occurred_at desc)`, `(tenant_id, event_type, occurred_at)`
- **gamification_goals** (metas por consultor/período)
  - `tenant_id`, `member_id`, `period` (`daily|weekly|monthly`), `metric` (`sales|meetings|points|contacts`), `target_value`, `start_date`, `end_date`
- **gamification_goal_history** (snapshot do que foi atingido por período fechado)
- **gamification_streaks** (1 por member: `current_streak`, `best_streak`, `last_active_date`)

### Triggers automáticas (sem alterar lógica existente — apenas observam)
- `AFTER UPDATE ON leads`: detectar mudança de `assigned_member_id` (assumir lead), `stage`/`status` para venda fechada/perdida → insere em `gamification_events`.
- `AFTER INSERT ON appointments`: reunião agendada → evento.
- `AFTER INSERT ON messages WHERE direction='outbound'`: contato realizado + bônus de resposta rápida se < threshold após inbound.

Tudo idempotente (chave única em `gamification_events(tenant_id, event_type, lead_id, appointment_id, member_id, occurred_at)` quando aplicável) para evitar duplicação em re-execuções.

### Views/RPCs para leitura rápida
- `rpc_ranking(tenant_id, period)` → ranking agregado por member com pontos, vendas, conversão.
- `rpc_my_gamification_summary(member_id)` → KPIs do consultor.
- `rpc_team_overview(tenant_id, period)` → para supervisor (inclui leads parados, offline, queda).
- `rpc_executive_overview(tenant_id, period)` → para owner/admin.

---

## 2. Frontend — novas rotas (aditivas em `App.tsx`)

```
/ranking              → RankingPage   (todos os perfis, com vista adaptada)
/ranking/equipe       → TeamRankingPage  (supervisor+)
/ranking/executivo    → ExecutiveRankingPage  (owner/superadmin)
```

Roteamento usa `usePermissions` (`view_team_metrics`, `view_financial`) já existente — zero mudança na matriz de permissões.

### Estrutura de arquivos nova
```
src/
  pages/app/ranking/
    RankingPage.tsx           ← roteia view conforme role efetivo
    ConsultorView.tsx
    SupervisorView.tsx
    ExecutivoView.tsx
  components/ranking/
    RankCard.tsx              ← top 3 com medalhas
    RankList.tsx
    LevelBadge.tsx            ← bronze/prata/ouro/diamante
    GoalProgress.tsx
    StreakFlame.tsx
    MotivationalCard.tsx
    KpiTile.tsx
    PointsBreakdown.tsx
    PeriodFilter.tsx          ← diário/semanal/mensal/geral
    TeamFilters.tsx
    AlertsPanel.tsx           ← leads parados, consultores offline
    ExecutiveCharts.tsx       ← recharts: linha/barras/funil
  hooks/ranking/
    useGamificationConfig.ts
    useMyGamification.ts
    useRanking.ts
    useTeamOverview.ts
    useExecutiveOverview.ts
    useGoals.ts
```

### Navegação
Adicionar item "Ranking" no sidebar de `AppLayout.tsx` (apenas um `NavLink` novo — sem mexer no resto).

---

## 3. Visões por perfil

### Consultor (`ConsultorView`)
Posição + medalha, nível, pontos, streak, KPIs (leads assumidos, contatos, reuniões, vendas, conversão, T.resposta), metas D/S/M com barras, comissão estimada, cards motivacionais dinâmicos ("Faltam X vendas…", "Você está em Nº lugar").

### Supervisor (`SupervisorView`)
Ranking da equipe, tabela de produtividade, alertas (leads parados, consultores offline via `last_seen_at`, queda de produtividade comparando semana atual vs anterior), filtros período/consultor.

### Executivo (`ExecutivoView`)
Ranking geral, faturamento estimado, ROI, conversão geral, gráficos recharts (linha temporal, barras por equipe, funil pipeline), comparativo histórico.

---

## 4. Design

Reaproveita 100% do design system atual: tokens HSL de `index.css`, `Card`, `Progress`, `RoleBadge`, fonte display/mono já em uso, mesmos espaçamentos da `MyProfilePage`/`PerformanceStats`. Animações suaves com `framer-motion` (já no projeto) para entrada de cards do top 3 e contadores.

---

## 5. Performance

- Agregações pesadas em RPCs SQL (não no client).
- `react-query` com `staleTime` 60s para ranking, 15s para "meu resumo".
- Paginação na lista de ranking (>50 membros).
- `gamification_events` indexada; queries sempre filtram por `tenant_id` + janela temporal.

---

## 6. Garantias de não-quebra

- Nenhum arquivo existente é removido ou re-escrito; apenas:
  - `src/App.tsx`: 3 imports + 3 `<Route>`.
  - `src/components/layout/AppLayout.tsx`: 1 item de menu novo.
- Triggers são `AFTER` e fazem apenas `INSERT` em tabela nova — falha silenciosa (`EXCEPTION WHEN OTHERS THEN RETURN NEW`) para nunca bloquear operação existente.
- Tipos do Supabase são regenerados automaticamente.

---

## 7. Ordem de execução

1. Migração SQL (tabelas, RLS, triggers, RPCs, seed `gamification_config` default por tenant).
2. Hooks (`useRanking`, `useMyGamification`, …).
3. Componentes visuais.
4. Páginas + rotas + item de menu.
5. QA visual em desktop e mobile.

Confirma para eu seguir com a migração e a implementação?
