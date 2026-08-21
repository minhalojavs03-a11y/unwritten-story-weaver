// Closers da Feracon — responsáveis por conduzir as reuniões agendadas
// pelos consultores. A agenda do dia é dividida por estes closers.
export type Closer = { id: string; name: string; color: string };

export const CLOSERS: Closer[] = [
  { id: "2769c443-2850-4f64-8497-93f53936e4e9", name: "Gizele", color: "#7C3AED" },
  { id: "29fc52f9-c95c-4695-aea3-e2363e2b3cc7", name: "Micaelly", color: "#1E40AF" },
];

export function closerById(id?: string | null): Closer | null {
  if (!id) return null;
  return CLOSERS.find((c) => c.id === id) ?? null;
}
