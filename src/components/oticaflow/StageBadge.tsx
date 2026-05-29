import { cn } from "@/lib/utils";
import { stageBadgeClass, stageLabels, type Stage } from "@/data/mock";

interface Props {
  stage: Stage | string | null | undefined;
  className?: string;
}

const validStages = ["novo","qualificado","agendado","compareceu","comprou","perdido"] as const;

export function StageBadge({ stage: s, className }: Props) {
  const stage: Stage = (validStages as readonly string[]).includes(s ?? "") ? (s as Stage) : "novo";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", stageBadgeClass[stage], className)}>
      {stageLabels[stage]}
    </span>
  );
}
