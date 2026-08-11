// Closers da Feracon — responsáveis por conduzir as reuniões agendadas
// pelos consultores. A agenda do dia é dividida por estes closers.
export type Closer = { id: string; name: string; color: string };

export const CLOSERS: Closer[] = [
  { id: "2769c443-2850-4f64-8497-93f53936e4e9", name: "Gizele", color: "#7C3AED" },
  { id: "a1f959f9-8318-42c6-a843-6804fddef7c0", name: "Antonio Junior", color: "#1E40AF" },
];

export function closerById(id?: string | null): Closer | null {
  if (!id) return null;
  return CLOSERS.find((c) => c.id === id) ?? null;
}
