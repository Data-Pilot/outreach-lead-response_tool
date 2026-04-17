"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type BulkAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive" | "secondary";
  disabled?: boolean;
};

export function BulkActionBar({
  count,
  actions,
  onClear,
  className,
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl",
        className
      )}
    >
      <span className="text-sm font-medium tabular-nums">
        {count} selected
      </span>
      <div className="h-4 w-px bg-border" />
      {actions.map((action, i) => (
        <Button
          key={i}
          type="button"
          size="sm"
          variant={action.variant ?? "default"}
          onClick={action.onClick}
          disabled={action.disabled}
          className="px-3"
        >
          {action.label}
        </Button>
      ))}
      <div className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}
