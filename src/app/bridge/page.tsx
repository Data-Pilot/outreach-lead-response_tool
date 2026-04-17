"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Mail, Pause, Play } from "lucide-react";
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

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function CampaignStatusBadge({ status }: { status: Campaign["status"] }) {
  if (status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <Play className="size-2.5 fill-emerald-600 text-emerald-600" />
        Active
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
        <Pause className="size-2.5 fill-orange-600 text-orange-600" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
      <CheckCircle2 className="size-3 text-slate-500" />
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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/campaigns?limit=50");
        const data = (await res.json()) as { campaigns?: Campaign[] };
        const list = data.campaigns ?? [];
        setCampaigns(list);
        const first = list.find((c) => c.sent_count > 0) ?? list[0] ?? null;
        if (first) setSelectedId(first.id);
      } catch {
        /* non-fatal */
      } finally {
        setLoadingCampaigns(false);
      }
    })();
  }, []);

  const loadLeads = useCallback(async (campaignId: string) => {
    setLoadingLeads(true);
    setLeads([]);
    try {
      const res = await fetch(
        `/api/outreach?campaign_id=${encodeURIComponent(campaignId)}&per_page=100`
      );
      const data = (await res.json()) as { leads?: Lead[] };
      const withLinkedIn = (data.leads ?? []).filter((l) => l.linkedin_url?.trim());
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

  const pendingCount = leads.filter((l) => !LINKEDIN_REACHED.has(l.status)).length;
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
              <Building2 className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Campaigns</h2>
            </div>

            {loadingCampaigns ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No campaigns yet.</p>
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
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" />
                                {c.sent_count} sent
                              </span>
                              <span>·</span>
                              <span>{formatDate(c.created_at)}</span>
                            </div>
                            <div className="mt-1.5">
                              <CampaignStatusBadge status={c.status} />
                            </div>
                          </div>
                          {c.sent_count > 0 && (
                            <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                              <LinkedInIcon className="size-4" />
                              {c.sent_count}
                            </span>
                          )}
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
                <LinkedInIcon className="size-4 text-[#0077b5]" />
                <h2 className="text-sm font-semibold">LinkedIn Outreach</h2>
              </div>
              {pendingCount > 0 && (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  {pendingCount} pending
                </span>
              )}
            </div>

            {!selectedId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <LinkedInIcon className="mb-3 size-10 opacity-20" />
                <p className="text-sm">Select a campaign to see contacts</p>
              </div>
            ) : loadingLeads ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <LinkedInIcon className="mb-3 size-10 opacity-20" />
                <p className="text-sm">
                  No leads with LinkedIn URLs in{" "}
                  <span className="font-medium text-foreground">{selectedCampaign?.name}</span>.
                </p>
                <p className="mt-1 text-xs">Enrich leads to capture LinkedIn profiles.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {leads.map((lead, i) => {
                  const reached = LINKEDIN_REACHED.has(lead.status);
                  const contacted = lead.status === "sent";
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
                          {contacted && (
                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{lead.role || "—"}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="size-3 shrink-0" />
                          <span className="truncate">{lead.company || "—"}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {reached ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <LinkedInIcon className="size-3.5" />
                            Sent
                          </span>
                        ) : contacted ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Mail className="size-3.5" />
                              Sent
                            </span>
                            <Button
                              size="sm"
                              onClick={() =>
                                window.open(lead.linkedin_url, "_blank", "noopener,noreferrer")
                              }
                              className="gap-1.5"
                            >
                              <LinkedInIcon className="size-3.5" />
                              Reach Out
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              window.open(lead.linkedin_url, "_blank", "noopener,noreferrer")
                            }
                            className="gap-1.5"
                          >
                            <LinkedInIcon className="size-3.5" />
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
