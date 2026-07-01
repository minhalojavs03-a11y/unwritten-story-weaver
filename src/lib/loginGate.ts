// Controle temporário para bloquear login e exibir aviso de "erro" de saldo
// de instância WhatsApp / IA. Ajuste as flags abaixo para reativar acesso.
//
// LOGIN_BLOCKED: bloqueia login de consultores/owner/supervisor.
// SUPERADMIN_BLOCKED: bloqueia também o login do superadmin (apenas para teste).
export const LOGIN_BLOCKED = true;
export const SUPERADMIN_BLOCKED = true;

export const LOGIN_GATE_TITLE = "Serviço temporariamente indisponível";
export const LOGIN_GATE_CODE = "ERR_WA_BAL_0345";

export const LOGIN_GATE_MESSAGE = [
  "Não foi possível concluir o login neste momento.",
  "",
  "Motivo: saldo da instância WhatsApp insuficiente para uso da IA de atendimento.",
  "A operação foi suspensa automaticamente para evitar falhas nas conversas.",
  "",
  `Código do erro: ${LOGIN_GATE_CODE}`,
  "Módulo: whatsapp-instance / ai-gateway",
  "Referência técnica: BILLING_QUOTA_EXCEEDED (error_345 · sub_err_112)",
  "",
  "Aguarde o restabelecimento do serviço ou contate o administrador.",
].join("\n");
