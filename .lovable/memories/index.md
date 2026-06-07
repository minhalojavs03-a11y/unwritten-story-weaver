# Project Memory

## Core
Domínio oficial: feracon.com.br. NUNCA usar lovable.app — acessos por *.lovable.app/*.lovableproject.com/*.lovable.dev devem redirecionar para feracon.com.br (exceto dentro do iframe do editor). Links/convites devem usar VITE_APP_DOMAIN=https://feracon.com.br.
Sistema **single-tenant Feracon**. `FERACON_TENANT_ID = '9ecb99e2-50ee-404f-920b-81cd94cc685e'` (importar de `src/lib/feracon.ts`). Todos os funcionários compartilham este tenant. Isolamento é por ROLE, nunca por tenant_id. Não criar fluxos de "novo tenant/loja".
Visibilidade de consultor: vê leads/conversas/mensagens/coaching onde `assigned_to = auth.uid()` OU onde o `assigned_member_id` aponta para o seu `tenant_members.user_id`. Owner/supervisor/superadmin veem tudo. Métricas do painel inicial são contadas por `assigned_member_id`.
Leads/conversas/mensagens da Ediane (telefone `+55 45 99987-4647`) só são visíveis para superadmin — policies por `is_ediane_phone`.
Hierarquia Feracon: Dono=Ediane, Supervisor=Antonio, todos os demais=Consultores (até mudança explícita). Superadmin Arley é invisível.

## Memories
- [Tenant único Feracon](mem://architecture/tenant-isolation) — Constante FERACON_TENANT_ID, fallback em queries, isolamento por role.
- [Hierarquia Feracon](mem://architecture/feracon-hierarchy) — Cargos fixos: Ediane Dona, Antonio Supervisor, demais Consultores.
