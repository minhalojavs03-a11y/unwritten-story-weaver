## Objetivo

Na tela **Distribuição de Leads** (visível apenas para superadmin/dono), permitir configurar **separadamente** quais consultores recebem leads de cada planilha — **Leads 01** (a principal já existente) e **Leads 02** (a planilha nova `1kzZswK6Tn…`). Hoje existe um único toggle "Recebe leads" por consultor, que não distingue origem.

## O que muda

### 1. Banco de dados (migração)

- Adicionar coluna `receives_leads_02 boolean NOT NULL DEFAULT false` em `tenant_members`.
  - O campo atual `receives_leads` passa a significar **Leads 01** (a planilha principal).
  - Por padrão, ninguém recebe Leads 02 — o superadmin/dono ativa quem deve receber.
- Atualizar a RPC `list_distribution_consultants` para retornar também `receives_leads_02`.
- Atualizar a RPC `update_member_distribution` (ou criar `update_member_distribution_v2`) para aceitar `_receives_leads_01` e `_receives_leads_02` separados.

### 2. Função `notify-consultant-by-tier`

- Ler `lead.metadata.sheet_source_label` (gravado pelo `sheets-sync` na sincronização).
- Se origem for **Leads 02**, filtrar consultores por `receives_leads_02 = true` em vez de `receives_leads`.
- Se origem for **Leads 01** ou ausente, manter `receives_leads = true` (comportamento atual).
- Resto da lógica (faixa de crédito, limite diário, balanceamento) permanece igual.

### 3. UI — `src/pages/app/DistribuicaoLeadsPage.tsx`

Substituir o switch único "Recebe leads" por **dois switches lado a lado** no card de cada consultor:

```text
┌─────────────────────────────────────────────────────────────────┐
│ [avatar] Nome              │ Leads 01 [▢] │ Leads 02 [▢] │ ... │
│          Consultor         │              │              │     │
└─────────────────────────────────────────────────────────────────┘
```

- Etiqueta clara: "Leads 01" (azul) e "Leads 02" (violeta), mesmas cores usadas nos badges da Fila.
- Salvamento automático ao alternar cada switch.
- Tooltip explicando que Leads 02 vem da nova planilha.
- Resumo no topo da página mostrando contagem: "X consultores recebem Leads 01 · Y recebem Leads 02".

Os demais campos (faixa de crédito, limite diário, canais de notificação) continuam globais — não há demanda para separá-los por origem.

### 4. Tipos

Após a migração rodar, `src/integrations/supabase/types.ts` será regenerado automaticamente. O código TS usa `as any` na chamada das RPCs, então não trava o build.

## Detalhes técnicos

- A coluna `receives_leads_02` precisa ser **default false** para não vazar Leads 02 para consultores que historicamente recebem só Leads 01.
- A função `notify-consultant-by-tier` é disparada a partir do `process-notification-queue` (que lê o lead) — basta consultar `lead.metadata->>'sheet_source_label'` ali dentro; não precisa propagar nada extra do `sheets-sync`.
- `FilaLeadsPage.consultants` (linha 110) e `ConversasPage` (linha 1175) filtram por `receives_leads` para listar destinatários no menu "Enviar para…". Manter o filtro atual (Leads 01) — quando um superadmin/dono envia manualmente um lead Leads 02, ele já escolhe o consultor diretamente; não é necessário restringir a lista por origem nesse fluxo manual.

## Fora de escopo

- Faixas de crédito separadas por origem.
- Limite diário separado por origem.
- Alterar o fluxo de "enviar lead manualmente" para filtrar por origem.
