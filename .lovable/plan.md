# Refactor: White-label → Empresa única (Feracon)

## Estado atual descoberto
- **15 tenants** no banco. Apenas 1 é a Feracon real (`9ecb99e2-50ee-404f-920b-81cd94cc685e`). Os outros 14 são "tenants pessoais" de cada funcionário (Antonio, Nilton, Gregory, Jean, Kauana, Ediane, Hélio, etc).
- **13 profiles**, cada um apontando para seu próprio tenant.
- **1432 leads** espalhados em 9 tenants. Conversas, mensagens, agendamentos idem.

## Constante canônica
Usar o tenant **existente** em vez do UUID `00000…0001` (já tem nome "Feracon", slug "feracon"):
```
FERACON_TENANT_ID = '9ecb99e2-50ee-404f-920b-81cd94cc685e'
```

## Etapa 1 — Migração SQL (destrutiva, com backup confirmado)

**1.1 Consolidar dados** — para CADA tabela com `tenant_id` (44 tabelas listadas), rodar:
```sql
UPDATE public.<tabela> SET tenant_id = '9ecb99e2-…' WHERE tenant_id <> '9ecb99e2-…';
```
Tabelas: ai_config, app_notifications, appointments, automations, billing_settings, business_hours, campaigns, coaching_insights, coaching_message_analysis, conversations, faqs, gamification_*, google_integration, impersonation_log, instance_charges, knowledge_files, lead_notifications, lead_transfer_requests, leads, meeting_recordings, messages, nilton_leads, notification_queue, products, profiles, recording_views, sheet_*, team_invites, templates, tenant_credentials, tenant_invites, tenant_members, tenant_memberships, tenant_role_invites, whatsapp_*.

**1.2 Deduplicar `tenant_memberships`** — após o UPDATE pode haver `(tenant_id, user_id)` duplicado. Manter o mais antigo, deletar resto.

**1.3 Limpar `whatsapp_instances`** — pode haver conflito de instância principal por tenant; manter apenas as do Feracon original.

**1.4 Apagar os 14 tenants vazios:**
```sql
DELETE FROM public.tenants WHERE id <> '9ecb99e2-…';
```

**1.5 DEFAULT + NOT NULL** em `tenant_id` em todas as 44 tabelas (onde já não for).

**1.6 Simplificar RLS** — substituir checks de `is_tenant_member(...)` por checks de role apenas (superadmin/owner/supervisor veem tudo; consultor vê só o atribuído). Pattern aplicado em: leads, conversations, messages, appointments, nilton_leads, app_notifications, lead_notifications, coaching_insights, gamification_events. Demais tabelas mantêm RLS atual (que já vai funcionar porque todos no mesmo tenant).

## Etapa 2 — Código

**2.1** Criar `src/lib/feracon.ts`:
```ts
export const FERACON_TENANT_ID = '9ecb99e2-50ee-404f-920b-81cd94cc685e';
```

**2.2** Em `AuthContext` e hooks, fallback: `user?.tenant_id ?? FERACON_TENANT_ID`.

**2.3** Remover UI white-label:
- `src/pages/admin/AdminClientes.tsx` — remover botão "Novo cliente" e modal de criar tenant. Repurposar página como "Funcionários Feracon" listando profiles + role.
- `src/components/dashboard/DashboardScopeFilter.tsx` — remover seletor de tenant; manter só o de consultor.
- `src/pages/admin/AdminDashboard.tsx` — remover stat "Lojas cadastradas/ativas" e a lista de tenants; substituir por "Visão geral Feracon" (consultores ativos, leads hoje, conversas ativas).
- `src/pages/onboarding/OnboardingPage.tsx` — se houver fluxo de criar tenant, simplificar para apenas username/pin.
- Strings UI: "loja"→"equipe", "cliente"→"funcionário" no contexto admin, etc.

**2.4** Desabilitar RPC `admin_create_tenant` (drop function ou retornar erro).

## Etapa 3 — Memória
Reescrever `mem://index.md` core: remover "cada usuário tem seu próprio tenant isolado", substituir por "Tenant único: Feracon (`9ecb99e2-…`). Todos os funcionários compartilham este tenant. Isolamento é por role, não por tenant."

## Riscos
- **Membership unique constraint** pode falhar se algum user já tinha membership no Feracon + na sua própria. Tratamos com `ON CONFLICT DO NOTHING` + DELETE.
- **Políticas RLS antigas** podem bloquear o próprio UPDATE da migração — vou rodar como SECURITY DEFINER / superuser na migration.
- **Caso da Ediane** (memória anterior): ela some do banco original via RLS `is_ediane_phone`. Após fusão, leads dela voltam a aparecer para todos. A policy `RESTRICTIVE` que limita a superadmin **continua valendo** porque é por telefone, não por tenant. OK.
- **Edge functions** (`register-client`, `whatsapp-bootstrap-principal`) podem criar novos tenants. Vou auditar e forçá-las a usar `FERACON_TENANT_ID`.

## Ordem de execução
1. Plano aprovado.
2. Migração SQL única (Etapas 1.1–1.6). Pausa para aprovação.
3. Após migration rodar com sucesso → mudanças de código (Etapa 2) em paralelo.
4. Atualizar memória (Etapa 3).
5. Auditoria final: grep por "loja", "tenant" em strings UI, `admin_create_tenant`, RPC `create_tenant_with_owner`.

## O que NÃO vou fazer
- Não vou dropar a coluna `tenant_id` nem a tabela `tenants` (instrução explícita do prompt).
- Não vou mexer no caso Ediane (policies já criadas continuam válidas).
- Não vou tocar em lógica de feature funcionando (distribuição, coaching, gamification) — só no `tenant_id` filter.
