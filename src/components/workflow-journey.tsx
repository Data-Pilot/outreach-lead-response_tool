"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const STEPS = [
  { n: 1, label: "Identity" },
  { n: 2, label: "Find leads" },
  { n: 3, label: "Enrich" },
  { n: 4, label: "Generate" },
  { n: 5, label: "Review" },
  { n: 6, label: "Launch" },
  { n: 7, label: "Track" },
] as const;

function activeIndices(pathname: string): Set<number> {
  if (pathname === "/") return new Set([1]);
  if (pathname === "/prospecting") return new Set([2, 3, 4]);
  if (pathname.startsWith("/review")) return new Set([5]);
  if (pathname.startsWith("/outreach")) return new Set([6]);
  if (pathname.startsWith("/funnel") || pathname.startsWith("/bridge"))
    return new Set([7]);
  return new Set();
}

function linkForStep(stepN: number, lastCampaignId: string | null): string {
  if (stepN === 5) {
    if (lastCampaignId)
      return `/review?campaign_id=${encodeURIComponent(lastCampaignId)}`;
    return "/review";
  }
  if (stepN === 6) {
    if (lastCampaignId)
      return `/outreach?campaign_id=${encodeURIComponent(lastCampaignId)}`;
    return "/outreach";
  }
  if (stepN === 7) return "/funnel";
  if (stepN === 1) return "/";
  return "/prospecting";
}

function WorkflowJourneyInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl =
      pathname.startsWith("/outreach") || pathname.startsWith("/review")
        ? searchParams.get("campaign_id")?.trim() ?? null
        : null;
    if (fromUrl) {
      try {
        localStorage.setItem("dp_last_campaign_id", fromUrl);
      } catch {
        /* ignore */
      }
      setLastCampaignId(fromUrl);
      return;
    }
    try {
      setLastCampaignId(localStorage.getItem("dp_last_campaign_id")?.trim() ?? null);
    } catch {
      setLastCampaignId(null);
    }
  }, [pathname, searchParams]);

  const active = activeIndices(pathname ?? "");

  return (
    <div className="border-b border-border bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Workflow
        </p>
        <nav
          className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] sm:text-xs"
          aria-label="Outreach workflow"
        >
          {STEPS.map((step, i) => {
            const isActive = active.has(step.n);
            const href = linkForStep(step.n, lastCampaignId);
            return (
              <span key={step.n} className="inline-flex items-center">
                {i > 0 && (
                  <span className="mx-0.5 text-muted-foreground/50" aria-hidden>
                    →
                  </span>
                )}
                <Link
                  href={href}
                  className={
                    isActive
                      ? "rounded-md bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground shadow-sm"
                      : "rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  }
                >
                  {step.label}
                </Link>
              </span>
            );
          })}
        </nav>
        {pathname === "/prospecting" && (
          <p className="mt-1.5 text-[10px] text-muted-foreground sm:text-xs">
            Fetch, enrich, and generate messages on this page — then open{" "}
            <strong className="text-foreground">Review</strong> when you are ready.
          </p>
        )}
      </div>
    </div>
  );
}

export function WorkflowJourney() {
  return (
    <Suspense
      fallback={
        <div
          className="h-14 border-b border-border bg-muted/20"
          aria-hidden
        />
      }
    >
      <WorkflowJourneyInner />
    </Suspense>
  );
}
