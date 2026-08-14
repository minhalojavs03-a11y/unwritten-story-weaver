/**
 * Suporte técnico Feracon.
 * Atendimento humano feito direto no WhatsApp; fora do horário o usuário
 * abre um ticket (com prints) que cai no menu "Tickets" da conta de suporte.
 */
export const SUPPORT_NAME = "Adilielson";
export const SUPPORT_LABEL = "Suporte técnico";
export const SUPPORT_PHONE_E164 = "5527981392914";
export const SUPPORT_PHONE_DISPLAY = "+55 27 98139-2914";

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE_E164}`;

/** Horário de atendimento: seg–sex, 08:00–18:00 (America/Sao_Paulo). */
export function isSupportOnline(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (["Sat", "Sun"].includes(weekday)) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 8 * 60 && minutes < 18 * 60;
}

export const SUPPORT_HOURS_LABEL = "Seg a Sex · 08h às 18h";

export type TicketStatus = "novo" | "em_andamento" | "aguardando" | "resolvido" | "fechado";

export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "novo",
  "em_andamento",
  "aguardando",
  "resolvido",
  "fechado",
];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  aguardando: "Aguardando cliente",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  novo: "bg-primary/15 text-primary border-primary/30",
  em_andamento: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  aguardando: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  resolvido: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  fechado: "bg-muted text-muted-foreground border-border",
};

export const TICKET_PRIORITY_LABEL: Record<string, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};
