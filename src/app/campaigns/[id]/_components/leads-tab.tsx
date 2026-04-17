"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

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

export function LeadsTab({ campaignId }: { campaignId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  const fetchLeads = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/outreach?campaign_id=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as { leads?: Lead[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load leads");
      setLeads(data.leads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l._id));
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
      await fetchLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleGenerate = async () => {
    const idsWithEmail = selectedIds.filter((id) => {
      const lead = leads.find((l) => l._id === id);
      return lead && lead.email.trim().length > 0;
    });
    if (idsWithEmail.length === 0) {
      setError("No selected leads have an email. Enrich first.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: idsWithEmail }),
      });
      const data = (await res.json()) as { error?: string; processed_count?: number };
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      setGeneratedCount(data.processed_count ?? idsWithEmail.length);
      await fetchLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-muted/40 overflow-hidden">
        <SkeletonRows count={6} />
      </div>
    );
  }

  if (error && leads.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={() => void fetchLeads()}>
          Retry
        </Button>
      </div>
    );
  }

  if (leads.length === 0) {
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

  const allSelected = selectedIds.length === leads.length;

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

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all leads"
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
