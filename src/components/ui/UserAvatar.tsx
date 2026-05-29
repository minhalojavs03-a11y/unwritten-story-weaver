import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#1E40AF", "#7C3AED", "#059669", "#DC2626",
  "#D97706", "#0891B2", "#BE185D", "#374151",
];

export function colorFromId(id?: string | null) {
  if (!id) return PALETTE[0];
  const code = id.charCodeAt(0) || 0;
  return PALETTE[code % PALETTE.length];
}

export function initialsFromName(name?: string | null) {
  const s = (name ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Size = 24 | 28 | 32 | 40 | 48 | 64 | 96 | 128;

interface UserAvatarProps {
  userId?: string | null;
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  size?: Size;
  showOnlineStatus?: boolean;
  isOnline?: boolean;
  className?: string;
  ringClassName?: string;
}

const SIZE_TEXT: Record<Size, string> = {
  24: "text-[10px]", 28: "text-[11px]", 32: "text-xs", 40: "text-sm",
  48: "text-base", 64: "text-lg", 96: "text-2xl", 128: "text-3xl",
};

export function UserAvatar({
  userId, name, avatarUrl, avatarColor, size = 40,
  showOnlineStatus = false, isOnline = false, className, ringClassName,
}: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!avatarUrl && !errored;
  const bg = avatarColor || colorFromId(userId);
  const initials = initialsFromName(name);

  const dotSize = Math.max(8, Math.round(size * 0.22));

  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white",
          SIZE_TEXT[size],
          ringClassName,
        )}
        style={showImage ? undefined : { backgroundColor: bg }}
        aria-label={name}
      >
        {showImage ? (
          <img
            src={avatarUrl!}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
            loading="lazy"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {showOnlineStatus && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-white",
            isOnline ? "bg-emerald-500" : "bg-slate-300",
          )}
          style={{ width: dotSize, height: dotSize }}
          aria-label={isOnline ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}

export const AVATAR_PALETTE = PALETTE;
