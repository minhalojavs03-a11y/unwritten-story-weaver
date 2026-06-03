# Plano: Classificação de Leads, Isolamento de "Outros" e RBAC

Mudança em 3 frentes, aplicadas em ordem (cada etapa testável de forma isolada).

---

## Etapa 1 — Classificação `lead` vs `outros`

### Modelo
- **Migração** em `public.leads`:
  - `ALTER TABLE public.leads ADD COLUMN kind text NOT NULL DEFAULT 'lead'` com `CHECK (kind IN ('lead','outros'))`.
  - Índice parcial: `CREATE INDEX idx_leads_tenant_kind ON public.leads(tenant_id, kind)`.
- **Função SQL** `public.normalize_phone(text)` (immutable): remove `+`, espaços, `-`, `(`, `)`, e prefixo `55` + `0` à esquerda. Usada por classificação e matching.
- **Função SQL** `public.classify_lead_kind(_tenant uuid, _phone text)`:
  - Retorna `'lead'` se existir em `leads` do mesmo tenant com `imported_from_sheet = true` OR `source IN ('ads','campaign','excel','sheet','planilha','anuncio','anúncio','meta','facebook','instagram','google')` e telefone normalizado igual.
  - Caso contrário, `'outros'`.

### Ingestão
- Patch em `supabase/functions/whatsapp-manage/index.ts` (na importação de conversas) e em `whatsapp-webhook/index.ts` (criação de lead a partir de mensagem nova): após `INSERT/UPSERT` em `leads`, chamar `classify_lead_kind` e setar `kind`. Mantém o comportamento atual de importar tudo.
- Leads vindos de `sheets-sync` / upload Excel / fontes de anúncio: forçar `kind = 'lead'` explicitamente (não classifica, é fonte).

### Backfill + Re-classificação contínua
- **Função** `public.reclassify_leads(_tenant uuid DEFAULT NULL)`: percorre leads cujo `imported_from_sheet = false` e `source NOT IN (...)`, recalcula `kind`. Migração executa um run inicial para todo o banco.
- **Trigger** `AFTER INSERT/UPDATE ON public.leads` quando `imported_from_sheet = true` OR `source` entra na lista: promove leads `outros` do mesmo tenant cujo telefone normalizado bate, para `kind = 'lead'`. Resolve o requisito "se a fonte for atualizada depois, promove outros → lead".

---

## Etapa 2 — Isolamento de "Outros" nas métricas

### Regra única
Todo lugar que conta/agrega/lista leads no funil de negócio aplica `.eq('kind','lead')` no nível da **query**. "Outros" só aparece na aba dedicada de Conversas.

### Pontos de aplicação (queries no frontend e funções SQL)
- **Hooks**: `useData`, `useNavBadges`, `useReportData`, `useGamification`, `useCoachingInsights`, `useTeam` (agregações), `useNotifications` (badges de lead).
- **Telas**: `DashboardPage` (KPIs, ExecutiveWidgets, LeadsHourlyPanel, WeekComparison), `LeadsPage`, `FilaLeadsPage` (tab "Todos"), `PipelinePage`, `RankingPage`, `RelatoriosPage`, `CoachingPage`, `DistribuicaoLeadsPage`.
- **Edge functions** que agregam: `analyze-coaching`, `analyze-simulations`, `notify-consultant-by-tier`, `notify-supervisors`, `enqueue-consultant-followups`, `resume-stalled-leads` → todos passam a filtrar `kind = 'lead'`.
- **Funções SQL de gamification** (`gamification_ranking`, `gamification_team_overview`, `gamification_executive_overview`): adicionar `JOIN/WHERE` excluindo eventos cujo `lead_id` aponta para `kind = 'outros'`.

### Conversas — aba "Outros"
- `ConversasPage`: adicionar aba "Outros" ao lado de "Todos/Não lidas/etc".
  - Query "Todos" e demais abas existentes passam a filtrar `leads.kind = 'lead'` via join.
  - Aba "Outros" filtra `leads.kind = 'outros'`.
  - Para consultor: `assigned_to = auth.uid()` (decisão sua).
  - Badge da aba "Outros" rotulado como **"não leads"** com estilo `muted/secondary` distinto, sem somar ao "Todos".

---

## Etapa 3 — RBAC ponta-a-ponta

### RLS (migração)
Adicionar policies por role usando funções helper já existentes (`has_app_role`, `get_tenant_role`, `is_tenant_member`).

Tabelas afetadas: `leads`, `conversations`, `messages`, `appointments`, `gamification_events`, `coaching_insights`, `lead_notifications`, `lead_transfer_requests`.

Padrão (exemplo `leads`):
```sql
DROP POLICY leads_all ON public.leads;

-- superadmin: tudo
CREATE POLICY leads_superadmin ON public.leads FOR ALL TO authenticated
  USING (has_app_role(auth.uid(),'superadmin'))
  WITH CHECK (has_app_role(auth.uid(),'superadmin'));

-- owner/supervisor: tudo do tenant
CREATE POLICY leads_owner_sup ON public.leads FOR ALL TO authenticated
  USING (get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'))
  WITH CHECK (get_tenant_role(auth.uid(), tenant_id) IN ('owner','supervisor'));

-- consultor/attendant: só os próprios + os não atribuídos (fila)
CREATE POLICY leads_consultant_own ON public.leads FOR SELECT TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id)
         AND (assigned_to = auth.uid() OR assigned_to IS NULL));

CREATE POLICY leads_consultant_write ON public.leads FOR UPDATE TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id) AND assigned_to = auth.uid())
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id) AND assigned_to = auth.uid());
```

> Você respondeu "restringir no RLS — consultor SÓ vê os próprios", mas mantenho `assigned_to IS NULL` em **SELECT** para a Fila de Leads continuar funcionando (sem isso, a tela `FilaLeadsPage` quebra completamente para consultor — fila ficaria vazia). Se quiser fila zerada para consultor, removo essa cláusula. Confirme se OK.

Para `conversations`/`messages`: consultor vê apenas onde `assigned_to = auth.uid()` (sem `IS NULL`, pois conversa sem dono não faz sentido para consultor individual).

### Rotas (`src/App.tsx` + `ProtectedRoute`)
Adicionar prop `denyConsultant` e bloquear consultor em: `/configuracoes/*`, `/distribuicao`, `/equipe`, `/treinar-ia`, `/whatsapp` (já tem requireOwner), `/integracoes`, `/ranking` (manter? — manter, consultor vê só sua pontuação), `/relatorios` (bloquear para consultor), `/coaching` (bloquear). Redireciona para `/crm`.

### Menu/UI (`AppLayout`/`NavLink`)
Esconder (não desabilitar) itens cujo usuário não pode acessar. Hook `usePermissions` já existe — usar `can()` para filtrar a lista do menu.

### Impersonation
Já existe (`superadmin-impersonate`). Sem mudança — superadmin continua atravessando tudo via policy `*_superadmin`.

---

## Ordem de entrega

1. **Migração 1** — coluna `kind`, funções `normalize_phone` / `classify_lead_kind` / `reclassify_leads`, trigger de promoção, backfill inicial.
2. **Patch edge functions de ingestão** (`whatsapp-manage`, `whatsapp-webhook`) para setar `kind` na criação.
3. **Filtros `.eq('kind','lead')`** em hooks/telas/funções SQL de gamification + aba "Outros" em `ConversasPage`.
4. **Migração 2 (RLS)** — substituir policies de `leads/conversations/messages/...` pelas versões role-aware.
5. **Roteamento + menu** — `ProtectedRoute denyConsultant`, esconder itens no `AppLayout`.

Cada etapa fechada e validada antes da próxima.

## Riscos / atenções
- Backfill de `kind` em produção: roda em uma migração; volume atual provavelmente OK, mas pode demorar — uso `UPDATE` em batch se necessário.
- RLS nova de `messages`/`conversations` para consultor pode esconder histórico de leads transferidos. Aceitável dado o requisito ("só os próprios").
- `assigned_to IS NULL` em `leads` para consultor — preciso confirmação (ver nota acima).
