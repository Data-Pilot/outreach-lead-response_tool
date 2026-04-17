import { cn } from "@/lib/utils";

export type LeadStatus =
  | "fetched"
  | "reviewed"
  | "sent"
  | "replied"
  | "bounced"
  | "meeting_set";

export type CampaignStatus =
  | "draft"
  | "sending"
  | "complete"
  | "paused";

export type UnifiedStatus = LeadStatus | CampaignStatus;

const CONFIG: Record<UnifiedStatus, { label: string; className: string }> = {
  // Lead statuses
  fetched:     { label: "Pending",     className: "bg-slate-100 text-slate-800 border-slate-300" },
  reviewed:    { label: "Reviewed",    className: "bg-slate-100 text-slate-800 border-slate-300" },
  sent:        { label: "Contacted",   className: "bg-sky-100 text-sky-900 border-sky-300" },
  replied:     { label: "Replied",     className: "bg-teal-100 text-teal-900 border-teal-300" },
  bounced:     { label: "Bounced",     className: "bg-rose-100 text-rose-900 border-rose-300" },
  meeting_set: { label: "Meeting Set", className: "bg-violet-100 text-violet-900 border-violet-300" },

  // Campaign statuses
  draft:       { label: "Draft",       className: "bg-slate-100 text-slate-800 border-slate-300" },
  sending:     { label: "Sending",     className: "bg-sky-100 text-sky-900 border-sky-300" },
  complete:    { label: "Complete",    className: "bg-teal-100 text-teal-900 border-teal-300" },
  paused:      { label: "Paused",      className: "bg-orange-100 text-orange-900 border-orange-300" },
};





export function StatusBadge({
  status,
  className,
}: {
  status: UnifiedStatus;
  className?: string;
}) {
  const cfg = CONFIG[status] ?? CONFIG.fetched;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export { CONFIG as STATUS_CONFIG };
