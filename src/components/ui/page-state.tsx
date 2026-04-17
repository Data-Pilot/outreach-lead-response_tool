import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";

type PageLoadingSkeletonProps = {
  /** Mirrors Command Center layout (title + identity card + tone strip). */
  variant?: "command-center" | "campaign-detail" | "generic";
  className?: string;
};

/**
 * Layout-faithful loading placeholder for full-width AppShell pages.
 */
export function PageLoadingSkeleton({
  variant = "generic",
  className,
}: PageLoadingSkeletonProps) {
  return (
    <div
      className={cn("w-full space-y-8", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>

      {variant === "command-center" && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-56 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="mt-1.5 h-7 w-20 shrink-0 rounded-full" />
          </div>
          <div className="rounded-xl bg-muted/40 p-5 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="min-h-[8rem] w-full rounded-lg" />
            <div className="rounded-lg border border-border/80 bg-background/60 p-4 space-y-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-5 space-y-4">
            <Skeleton className="h-5 w-48" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </>
      )}

      {variant === "campaign-detail" && (
        <div className="w-full space-y-6">
          <div className="rounded-lg bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex gap-1 border-b border-border pb-px">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-none rounded-t-md" />
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <Skeleton className="h-4 w-1/3 max-w-xs" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      )}

      {variant === "generic" && (
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}

type SuspenseFallbackProps = {
  className?: string;
};

/**
 * Matches common inner layout under AppShell (campaign detail uses max-w-5xl).
 */
export function SuspenseFallback({ className }: SuspenseFallbackProps) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      <PageLoadingSkeleton variant="campaign-detail" />
    </div>
  );
}
