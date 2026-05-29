interface Props { color: string }

export function ProfileCoverBanner({ color }: Props) {
  return (
    <div
      className="mx-3 h-36 rounded-b-[24px] border-x border-b border-black/5 md:mx-0 md:h-44 md:rounded-none md:border-0"
      style={{
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 50%, hsl(var(--background)) 140%)`,
      }}
      aria-hidden
    />
  );
}
