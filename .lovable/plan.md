# Auditoria do papel "Consultor" + Instância automática ao aceitar convite

## Parte 1 — Auditoria do que um consultor precisa hoje

### Já funciona
1. **Convite por link de papel** (`tenant_role_invites`) → `accept_role_invite` cria `tenant_memberships(role='consultant')`.
2. **Login** via Supabase Auth + onboarding (username, display_name, PIN) em `OnboardingPage`.
3. **Sidebar filtrada** em `AdminLayout`/`AppLayout` para consultor (esconde WhatsApp geral, Treinar IA, Configurações, Equipe, Integrações, Acessos).
4. **Leads/Conversas filtradas** no frontend pelo `assigned_to = auth.uid()`.
5. **Pipeline, Ranking pessoal, Relatórios pessoais** já respeitam o consultor.

### Lacunas detectadas
- **DB não tem o papel `consultant`** no enum `app_role` — toda restrição é frontend. Risco: API direta dá poder de owner. (Não vamos corrigir agora; só registrar na auditoria.)
- **Consultor não tem instância WhatsApp própria** — hoje precisa ser criada manualmente pelo dono em `/admin/instancias` ou `/configuracoes/whatsapp`.
- **RLS de `conversations` e `messages` já está correta para o pedido:**
  - `conversations_tenant_with_lead` → membros só veem conversas com `lead_id NOT NULL` (leads da lista/fila).
  - `conversations_superadmin_all` → superadmin vê tudo (inclusive sem lead).
  - Idem para `messages`.
  - Resultado: dono e supervisor já enxergam **automaticamente** todas as conversas de leads do tenant, vindas de qualquer instância (inclusive a do consultor), graças ao filtro por `tenant_id`.

## Parte 2 — Auto-provisionar instância no convite aceito

### Fluxo
```text
JoinPage.accept()
  └── rpc accept_role_invite(token)
        └── se role==='consultant':
              └── invoke('whatsapp-manage', { action:'create',
                       name:`WhatsApp ${displayName}`,
                       seller_user_id: user.id,
                       seller_name: displayName })
        └── navigate('/meu-whatsapp')  ← consultor escaneia QR
```

### Mudanças
1. **`src/pages/JoinPage.tsx`** — após `accept_role_invite` retornar `role='consultant'`, chamar `supabase.functions.invoke('whatsapp-manage', { body:{ action:'create', ... } })`. Falha não bloqueia (toast informativo); consultor consegue criar depois em `/meu-whatsapp`.
2. **`supabase/functions/whatsapp-manage/index.ts`** — o `create` hoje exige um `tenantId` resolvido pelo `getCallerContext`. Já funciona para o consultor recém-criado (ele já é membro do tenant pelo `accept_role_invite`). Adicionar **fallback de nome amigável** caso `name` venha vazio, usando `seller_name`. Garantir que `instance_charges` seja sempre cancelado (free) quando `seller_user_id` for consultor — já é, pois é a 2ª/3ª instância dentro do limite gratuito; basta passar `confirm_extra: true` para evitar bloqueio se passar de 3.
3. **`src/pages/app/MeuWhatsAppPage.tsx`** — já existe e mostra status/QR. Nenhuma mudança.

### Restrições mantidas
- Owner/Supervisor continuam vendo todas as conversas (RLS atual).
- Superadmin segue como único autorizado a importar conversas sem lead vinculado (RLS atual + `whatsapp-webhook` cria conversa com `lead_id NULL` quando não encontra match; só ele vê).
- Consultor enxerga só conversas dos próprios leads (filtro frontend já em vigor).

## Parte 3 — Diferenciais

- Pular silenciosamente se já existir instância com `seller_user_id = user.id` no tenant (idempotente).
- Logar erro em console e mostrar toast "Instância será criada quando você abrir /meu-whatsapp" se falhar.

## Arquivos tocados
- `src/pages/JoinPage.tsx` (acrescenta provisionamento pós-accept)
- `supabase/functions/whatsapp-manage/index.ts` (pequeno ajuste de validação de nome + idempotência por `seller_user_id`)

Nenhuma migração de banco necessária — schema já suporta `seller_user_id` e RLS de conversas já cobre o requisito.
