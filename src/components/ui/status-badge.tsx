import { cn } from "@/lib/utils";

export type LeadStatus =
  | "fetched"
  | "reviewed"
  | "sent"
  | "replied"
  | "bounced"
  | "meeting_set";

const CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  fetched:     { label: "Pending",     className: "bg-muted text-muted-foreground border-border" },
  reviewed:    { label: "Reviewed",    className: "bg-muted text-muted-foreground border-border" },
  sent:        { label: "Contacted",   className: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30" },
  replied:     { label: "Replied",     className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30" },
  bounced:     { label: "Bounced",     className: "bg-destructive/15 text-destructive border-destructive/30" },
  meeting_set: { label: "Meeting Set", className: "bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/30" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  const cfg = CONFIG[status] ?? CONFIG.fetched;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export { CONFIG as STATUS_CONFIG };
