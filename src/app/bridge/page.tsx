"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Link2, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  total_leads: number;
  sent_count: number;
  status: "draft" | "sending" | "complete";
  created_at: string | null;
};

type Lead = {
  _id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  linkedin_url: string;
  status: string;
};

function campaignStatusBadge(status: Campaign["status"]) {
  if (status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
        <span className="size-1.5 rounded-full bg-orange-500" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <CheckCircle2 className="size-3" />
      Completed
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const LINKEDIN_REACHED = new Set(["replied", "meeting_set"]);

export default function BridgePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Load campaigns on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/campaigns?limit=50");
        const data = (await res.json()) as { campaigns?: Campaign[] };
        const list = data.campaigns ?? [];
        setCampaigns(list);
        // Auto-select first campaign that has sent leads
        const first = list.find((c) => c.sent_count > 0) ?? list[0] ?? null;
        if (first) setSelectedId(first.id);
      } catch {
        /* non-fatal */
      } finally {
        setLoadingCampaigns(false);
      }
    })();
  }, []);

  // Load leads when selected campaign changes
  const loadLeads = useCallback(async (campaignId: string) => {
    setLoadingLeads(true);
    setLeads([]);
    try {
      const res = await fetch(
        `/api/outreach?campaign_id=${encodeURIComponent(campaignId)}&per_page=100`
      );
      const data = (await res.json()) as { leads?: Lead[] };
      const withLinkedIn = (data.leads ?? []).filter(
        (l) => l.linkedin_url?.trim()
      );
      setLeads(withLinkedIn);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadLeads(selectedId);
  }, [selectedId, loadLeads]);

  const pendingCount = leads.filter(
    (l) => !LINKEDIN_REACHED.has(l.status)
  ).length;

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Bridge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            LinkedIn outreach for emailed contacts
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: Campaigns */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Campaigns</h2>
            </div>

            {loadingCampaigns ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-muted/60"
                  />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No campaigns yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {campaigns.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                          isSelected
                            ? "border-primary/40 bg-primary/5 shadow-sm"
                            : "border-border bg-background hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {c.name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>✉ {c.sent_count} sent</span>
                              <span>·</span>
                              <span>{formatDate(c.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {c.sent_count > 0 && (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                                {c.sent_count}
                              </span>
                            )}
                            {campaignStatusBadge(c.status)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right: LinkedIn Outreach */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">LinkedIn Outreach</h2>
              </div>
              {pendingCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  {pendingCount} pending
                </span>
              )}
            </div>

            {!selectedId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Link2 className="mb-3 size-10 opacity-30" />
                <p className="text-sm">Select a campaign to see contacts</p>
              </div>
            ) : loadingLeads ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-muted/60"
                  />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Link2 className="mb-3 size-10 opacity-30" />
                <p className="text-sm">
                  No leads with LinkedIn URLs in{" "}
                  <span className="font-medium text-foreground">
                    {selectedCampaign?.name}
                  </span>
                  .
                </p>
                <p className="mt-1 text-xs">
                  Enrich leads to capture LinkedIn profiles.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {leads.map((lead, i) => {
                  const reached = LINKEDIN_REACHED.has(lead.status);
                  const isTop = i === 0 && !reached;
                  return (
                    <li
                      key={lead._id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                        isTop
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-background"
                      )}
                    >
                      <InitialsAvatar name={lead.name || "?"} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-foreground">
                            {lead.name || "Unknown"}
                          </p>
                          {lead.status === "sent" && (
                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.role || "—"}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="size-3 shrink-0" />
                          <span className="truncate">{lead.company || "—"}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {reached ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            <CheckCircle2 className="size-3" />
                            Sent
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(lead.linkedin_url, "_blank", "noopener,noreferrer")
                            }
                            className="gap-1.5"
                          >
                            <Link2 className="size-3.5" />
                            Reach Out
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
