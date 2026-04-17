import { cn } from "@/lib/utils";

const COLORS: [string, string][] = [
  ["#ede9fe", "#4c1d95"], // violet
  ["#dbeafe", "#1e3a8a"], // blue
  ["#d1fae5", "#064e3b"], // emerald
  ["#ffedd5", "#7c2d12"], // orange
  ["#fce7f3", "#831843"], // pink
  ["#cffafe", "#164e63"], // cyan
];

function colorFor(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash * 31) + name.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function InitialsAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm" ? "size-7 text-[10px]" :
    size === "lg" ? "size-11 text-base" :
    "size-9 text-xs";

  const [bg, color] = colorFor(name || "?");

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizeClass,
        className
      )}
      style={{ backgroundColor: bg, color }}
    >
      {initials(name || "?")}
    </span>
  );
}
