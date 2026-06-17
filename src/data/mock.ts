// Tipos compartilhados (legado de mocks; agora os dados vêm do Supabase)
export type Temperature = "hot" | "warm" | "cold";
export type Stage = "novo" | "qualificado" | "agendado" | "compareceu" | "comprou" | "perdido";

export const stageLabels: Record<Stage, string> = {
  novo: "Novo lead",
  qualificado: "Em qualificação",
  agendado: "Simulação enviada",
  compareceu: "Reunião",
  comprou: "Cota vendida",
  perdido: "Perdido",
};


export const stageOrder: Stage[] = ["novo", "qualificado", "agendado", "compareceu", "comprou", "perdido"];

export const tempLabels: Record<Temperature, string> = { hot: "Quente", warm: "Morno", cold: "Frio" };
export const tempEmoji: Record<Temperature, string> = { hot: "🔥", warm: "🌡", cold: "🧊" };

// Stage colors (Tailwind classes — values match tokens in tailwind.config.ts)
export const stageColorClass: Record<Stage, string> = {
  novo: "bg-stage-new",
  qualificado: "bg-stage-service",
  agendado: "bg-stage-scheduled",
  compareceu: "bg-stage-attended",
  comprou: "bg-success",
  perdido: "bg-stage-closed",
};

export const stageBadgeClass: Record<Stage, string> = {
  novo: "bg-stage-new/10 text-stage-new border-stage-new/20",
  qualificado: "bg-stage-service/10 text-stage-service border-stage-service/30",
  agendado: "bg-stage-scheduled/10 text-stage-scheduled border-stage-scheduled/20",
  compareceu: "bg-stage-attended/10 text-stage-attended border-stage-attended/20",
  comprou: "bg-success/10 text-success border-success/20",
  perdido: "bg-stage-closed/10 text-stage-closed border-stage-closed/20",
};
