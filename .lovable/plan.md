## Objetivo

Restringir o papel **Supervisor** a apenas visualização, removendo qualquer poder de alterar dados (pipeline, leads, conversas, configurações). Assumir uma conversa passa a exigir um fluxo de autorização: o consultor dono precisa marcar o lead como **perdido** E aprovar uma solicitação enviada por notificação no app. Supervisor não pode mais "invadir" conversas livremente.

## Mudanças

### 1. Matriz de permissões (`src/hooks/usePermissions.ts`)
Supervisor sai de TODAS as permissões de escrita. Fica somente com leitura:

```
view_all_leads:        [superadmin, owner, supervisor]   ✓ mantém
view_team_metrics:     [superadmin, owner, supervisor]   ✓ mantém
view_whatsapp:         [superadmin, owner, supervisor]   ✓ mantém
view_financial:        [superadmin, owner, supervisor]   ✓ mantém (somente leitura)

assume_any_lead:       [superadmin, owner]               ✗ remove supervisor
transfer_lead:         [superadmin, owner]               (já era)
configure_sheets:      [superadmin, owner]               ✗ remove
manage_team:           [superadmin, owner]               ✗ remove
configure_whatsapp:    [superadmin, owner]               ✗ remove
configure_ai:          [superadmin, owner]               ✗ remove
configure_integrations:[superadmin, owner]               ✗ remove
```

### 2. Fluxo de "solicitação de assumir lead perdido"

Nova tabela `lead_takeover_requests`:

```
id uuid pk
tenant_id uuid (Feracon)
lead_id uuid → leads
requester_user_id uuid (supervisor que pediu)
requester_member_id uuid → tenant_members
owner_user_id uuid (consultor dono)
owner_member_id uuid → tenant_members
status text ('pending'|'approved'|'denied'|'expired')
message text
created_at, responded_at timestamptz
```

GRANTs + RLS:
- Consultor dono e supervisor solicitante veem suas próprias linhas.
- Superadmin/owner veem tudo.
- INSERT permitido para supervisor (próprio user); UPDATE de status só pelo dono ou superadmin.

Funcionamento:
1. Supervisor abre conversa de um lead que NÃO é dele.
   - Se lead **não está perdido**: vê dados em modo leitura. Botão "Solicitar atendimento" desabilitado com tooltip "Disponível apenas quando o consultor marcar como perdido".
   - Se lead **está perdido**: botão "Solicitar atendimento" envia INSERT em `lead_takeover_requests` (status=pending) e dispara `app_notifications` para o consultor dono.
2. Consultor dono recebe notificação no sino (`useAppNotifications`) com ações **Aprovar / Recusar** → UPDATE em `lead_takeover_requests`.
3. Ao aprovar: trigger/função `approve_lead_takeover(request_id)` reatribui o lead ao supervisor solicitante e marca a request como `approved`. Cria notificação de volta para o supervisor.
4. Só após aprovação o supervisor consegue enviar mensagem / assumir oficialmente.

### 3. Bloqueios em UI (frontend)

Arquivos afetados, sempre checando `isSupervisor` via `useEffectiveRole()` e/ou `can(...)`:

- `src/pages/app/ConversasPage.tsx`
  - Input de mensagem desabilitado para supervisor a menos que ele seja o `assigned_member_id` (após aprovação).
  - Botão "Assumir" substituído por "Solicitar atendimento" (habilitado só se `lead.status === 'perdido'` e não existe request `pending` dele).
  - Esconder ações destrutivas (deletar/editar mensagem) — já estão escondidas; reforçar.
- `src/pages/app/PipelinePage.tsx`
  - Drag-and-drop desabilitado para supervisor (cards em modo leitura).
  - Bloquear mudanças de estágio, edição inline, ações de massa.
- `src/pages/app/LeadsPage.tsx` / `LeadsHojePage.tsx` / `FilaLeadsPage.tsx`
  - Esconder/desabilitar botões: editar, transferir, "Pegar", marcar status, excluir.
  - Sidebar de detalhes vira read-only: campos como inputs com `readOnly`/`disabled`.
- `src/pages/app/AgendaPage.tsx`, `ClientesPage.tsx`, `MensagensProntasPage.tsx`, `ConsultoresPage.tsx`, `EquipePage.tsx`, `DistribuicaoLeadsPage.tsx`, `ConfiguracoesPage.tsx`, `TreinarIAPage.tsx`, `MeuWhatsAppPage.tsx`, `WhatsAppPage.tsx`
  - Esconder botões "Novo/Editar/Excluir/Salvar" para supervisor. Formulários renderizam em modo leitura.
- `src/components/profile/InviteMemberModal.tsx`, `EditMemberModal.tsx`, `RoleInvitesPanel.tsx`
  - Bloqueados para supervisor (já cobertos pela remoção de `manage_team`).

Helper novo `src/hooks/useReadOnlySupervisor.ts` para um único ponto de verdade:

```ts
export function useReadOnlySupervisor() {
  const { isSupervisor, isOwner, isSuperadmin } = useEffectiveRole();
  return isSupervisor && !isOwner && !isSuperadmin;
}
```

### 4. RLS no banco

Reforçar policies de UPDATE/INSERT/DELETE em `leads`, `conversations`, `messages`, `appointments`, `templates`, `automations`, `whatsapp_instances`, `ai_config`, `tenant_members` para NÃO permitir mais a role `supervisor` — apenas `owner`/`superadmin` ou o próprio dono do recurso. SELECT continua liberado.

Migração revisa cada policy usando `public.has_role(...)` para remover supervisor onde aplicável.

### 5. Notificações

- Reaproveitar `app_notifications` com novos `type`:
  - `lead_takeover_request` (para o consultor dono)
  - `lead_takeover_approved` / `lead_takeover_denied` (para o supervisor)
- `useAppNotifications` ganha ações inline (Aprovar/Recusar) quando `type === 'lead_takeover_request'`.

## Detalhes técnicos

- Single-tenant Feracon mantido (`FERACON_TENANT_ID`).
- Migração cria: tabela `lead_takeover_requests`, GRANTs, RLS, função `approve_lead_takeover(uuid)` / `deny_lead_takeover(uuid)` SECURITY DEFINER, e atualização das policies existentes para remover supervisor.
- `useEffectiveRole` não muda — só os consumidores passam a tratar supervisor como leitura.
- Ediane (telefone privado) continua invisível para supervisor.

## Fora de escopo

- Não mexer em superadmin/owner.
- Não alterar lógica de privacidade de telefone já existente.
- Não criar nova página de auditoria (pode entrar depois).
