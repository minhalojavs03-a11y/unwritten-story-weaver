## Objetivo

Eliminar o conceito de "membro fake" (`tenant_members` com username+senha interna validados via `verify_tenant_member`) e substituir por **usuários reais do Supabase Auth convidados por email**, cada um com sua própria senha, vinculados ao tenant via uma tabela de membership.

---

## Fases (vou executar uma de cada vez, com aprovação entre elas)

### Fase 1 — Schema novo (migration)

Criar/ajustar tabelas:

- **`tenants`** — já existe, manter.
- **`tenant_memberships`** (nova) — substitui `tenant_members`:
  - `id`, `tenant_id`, `user_id` (FK auth.users), `role` (`owner` | `supervisor` | `consultor`), `display_name`, `avatar_color`, `created_at`, `last_seen_at`.
  - UNIQUE (`tenant_id`, `user_id`).
- **`tenant_invites`** (nova):
  - `id`, `tenant_id`, `email`, `role`, `token` (UUID), `invited_by` (user_id), `expires_at` (now()+7d), `accepted_at`, `accepted_by_user_id`, `created_at`.
  - Index único parcial: `(tenant_id, lower(email)) WHERE accepted_at IS NULL`.
- **`impersonation_log`** (nova) — auditoria:
  - `id`, `admin_user_id`, `target_user_id`, `tenant_id`, `started_at`, `ended_at`, `reason`.

Funções:
- `accept_tenant_invite(_token uuid)` SECURITY DEFINER — valida token, cria membership, marca invite aceito.
- `start_impersonation(_target_membership_id)` / `stop_impersonation()` — só p/ `owner`/`superadmin`.
- Atualizar `get_my_auth_context` para retornar role da membership nova.

RLS: tudo escopado por `tenant_id` e role.

### Fase 2 — Edge function de convite

- `send-tenant-invite` — recebe `{ email, role }`, valida que quem chama é owner/supervisor, cria `tenant_invites` row, dispara email com link `https://app/invite/<token>`.
- Setup do email domain (Lovable Emails) se ainda não tiver.

### Fase 3 — Frontend: aceitar convite

- Rota nova `/invite/:token`:
  - Se não logado → form de signup (email pré-preenchido, define senha) → cria conta → chama `accept_tenant_invite`.
  - Se logado com email igual → botão "Aceitar convite".
  - Se logado com email diferente → pede logout.

### Fase 4 — Frontend: refatorar Acessos / Consultores

- Página `Acessos` (`/configuracoes/acessos`): substituir CRUD de `tenant_members` por:
  - Lista de memberships ativas (nome, email, role, último acesso).
  - Lista de convites pendentes (email, role, expira em, botão "reenviar" / "revogar").
  - Botão "Convidar" → dialog com email + role.
- Remover botão "criar usuário+senha interna".

### Fase 5 — Remover sistema antigo

- Apagar: `MemberLoginDialog`, `ActiveMemberContext`, hook `useTenantMembers` (substituir por `useTenantMemberships`), edge function `register-client` (ou simplificar p/ só criar tenant+owner).
- Migrar uso de `useActiveMember()` em todo o app: a identidade passa a ser o `auth.user` direto + role da membership.
- Atualizar `ConsultoresPage`, distribuição de leads, atribuição de conversas, ranking, coaching — tudo que hoje referencia `tenant_member_id` passa a referenciar `user_id`.
- **Migration de dados**: para cada `tenant_members` existente, criar convite pendente para o email do dono fazer o onboard manual (ou apagar tudo se você confirmar que pode zerar).

### Fase 6 — Impersonação + auditoria

- Botão "Entrar como" na lista de membros (só owner/superadmin vê).
- Banner fixo no topo "Você está acessando como X — sair".
- Log em `impersonation_log`.
- Página `/admin/auditoria` para superadmin ver tudo.

---

## Pergunta antes de começar

**Sobre os dados atuais de `tenant_members`:** você quer

1. **Zerar tudo** — apago todos os membros fake existentes, e cada tenant convida do zero (mais limpo, recomendado já que você tem poucos dados reais).
2. **Migrar criando convites pendentes** — pra cada membro fake atual, gero um convite que precisa ser aceito pelo email real.

Me responde **1 ou 2** e eu já começo pela Fase 1 (a migration do schema).
