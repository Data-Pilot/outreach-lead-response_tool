"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";

import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import type { LeadStatus } from "@/components/ui/status-badge";

type Lead = {
  _id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  linkedin_url: string;
  status: LeadStatus;
  approved_variation: string;
  email_subject: string;
  email_body: string;
};

const PER_PAGE = 25;

export function LeadsTab({ campaignId }: { campaignId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!campaignId) return;
      setError(null);
      setLoading(true);
      try {
        const params = new URLSearchParams({
          campaign_id: campaignId,
          page: String(nextPage),
          per_page: String(PER_PAGE),
        });
        const res = await fetch(`/api/outreach?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          leads?: Lead[];
          error?: string;
          total_leads?: number;
          has_more?: boolean;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load leads");

        const rows = data.leads ?? [];
        const total = typeof data.total_leads === "number" ? data.total_leads : rows.length;

        if (rows.length === 0 && total > 0 && nextPage > 1) {
          await fetchPage(1);
          return;
        }

        setLeads(rows);
        setPage(nextPage);
        setTotalLeads(total);
        setHasMore(Boolean(data.has_more));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load leads");
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    setInitialLoad(true);
    setPage(1);
    setSelectedIds([]);
    void fetchPage(1);
  }, [campaignId, fetchPage]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === leads.length && leads.length > 0) {
      const pageIds = new Set(leads.map((l) => l._id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const l of leads) next.add(l._id);
        return Array.from(next);
      });
    }
  };

  const handleEnrich = async () => {
    if (selectedIds.length === 0) return;
    setIsEnriching(true);
    try {
      const res = await fetch("/api/apollo/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: selectedIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Enrich failed");
      await fetchPage(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one lead.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: selectedIds }),
      });
      const data = (await res.json()) as { error?: string; processed_count?: number };
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      const processed = data.processed_count ?? 0;
      setGeneratedCount(processed);
      if (processed === 0) {
        setError("None of the selected leads have an email. Enrich first.");
      }
      await fetchPage(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setIsGenerating(false);
    }
  };

  if (initialLoad && loading) {
    return (
      <div className="rounded-xl bg-muted/40 overflow-hidden">
        <SkeletonRows count={6} />
      </div>
    );
  }

  if (error && leads.length === 0 && totalLeads === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={() => void fetchPage(1)} className="px-3">
          Retry
        </Button>
      </div>
    );
  }

  if (totalLeads === 0 && !loading) {
    return (
      <EmptyState
        icon={<Users />}
        title="No leads in this campaign"
        description="Add leads by creating a new campaign from the prospecting page."
        action={
          <Link
            href="/campaigns/new"
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            New campaign
          </Link>
        }
      />
    );
  }

  const selectedOnPage = leads.filter((l) => selectedIds.includes(l._id)).length;
  const allOnPageSelected =
    leads.length > 0 && selectedOnPage === leads.length;

  const rangeStart = totalLeads === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(page * PER_PAGE, totalLeads);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {generatedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Generated email copy for {generatedCount} lead{generatedCount === 1 ? "" : "s"}.
          </p>
          <Link
            href="?tab=template"
            className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            Go to Template →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          Showing{" "}
          <span className="font-medium text-foreground">
            {rangeStart}–{rangeEnd}
          </span>{" "}
          of <span className="font-medium text-foreground">{totalLeads}</span> leads
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchPage(page - 1)}
            disabled={loading || page <= 1}
            className="px-3"
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchPage(page + 1)}
            disabled={loading || !hasMore}
            className="px-3"
          >
            Next
          </Button>
        </div>
      </div>

      <div
        className="relative rounded-xl border border-border"
        aria-busy={loading && !initialLoad}
      >
        {loading && !initialLoad && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]"
            aria-hidden
          >
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
        <div
          className={loading && !initialLoad ? "pointer-events-none opacity-50" : undefined}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all leads on this page"
                    className="cursor-pointer rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Name / Role
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Company
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  LinkedIn
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => {
                const checked = selectedIds.includes(lead._id);
                const hasEmail = lead.email.trim().length > 0;
                return (
                  <tr
                    key={lead._id}
                    className="bg-background transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(lead._id)}
                        aria-label={`Select ${lead.name}`}
                        className="cursor-pointer rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{lead.name || "—"}</p>
                      {lead.role && (
                        <p className="text-xs text-muted-foreground">{lead.role}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.company || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {hasEmail ? (
                        <span className="text-foreground">{lead.email}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <BulkActionBar
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        actions={[
          {
            label: isEnriching ? "Enriching…" : "Enrich",
            onClick: () => void handleEnrich(),
            disabled: isEnriching || isGenerating,
            variant: "outline",
          },
          {
            label: isGenerating ? "Generating…" : "Generate emails",
            onClick: () => void handleGenerate(),
            disabled: isGenerating || isEnriching,
          },
        ]}
      />

      <div className="flex justify-end pt-2">
        <Link
          href="?tab=template"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Next: Template →
        </Link>
      </div>
    </div>
  );
}
