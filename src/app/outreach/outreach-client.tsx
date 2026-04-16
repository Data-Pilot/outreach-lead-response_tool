"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CircleUser,
  Loader2,
  Mail,
  Play,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { LeadStatus } from "../../../models/Lead";

type Variations = { a: string; b: string; c: string };

type PipelineLead = {
  _id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  linkedin_url: string;
  status: LeadStatus;
  approved_variation: string;
  variations: Variations;
};

type CampaignSummary = {
  id: string;
  name: string;
  total_leads: number;
  sent_count: number;
  status: string;
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "fetched", label: "Pending (fetched)" },
  { value: "reviewed", label: "Pending (reviewed)" },
  { value: "sent", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "bounced", label: "Bounced" },
  { value: "meeting_set", label: "Meeting set" },
];

function badgeForStatus(status: LeadStatus): { label: string; className: string } {
  switch (status) {
    case "fetched":
    case "reviewed":
      return {
        label: "Pending",
        className: "bg-muted text-muted-foreground border-border",
      };
    case "sent":
      return {
        label: "Contacted",
        className: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30",
      };
    case "replied":
      return {
        label: "Replied",
        className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
      };
    case "bounced":
      return {
        label: "Bounced",
        className: "bg-destructive/15 text-destructive border-destructive/30",
      };
    case "meeting_set":
      return {
        label: "Meeting Set",
        className: "bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/30",
      };
    default:
      return {
        label: status,
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

function defaultEmailBody(lead: PipelineLead): string {
  const approved = lead.approved_variation.trim();
  if (approved) return approved;
  const a = lead.variations.a.trim();
  if (a) return a;
  const b = lead.variations.b.trim();
  if (b) return b;
  return lead.variations.c.trim();
}

function isReadyToSend(lead: PipelineLead): boolean {
  if (lead.status === "sent") return false;
  const email = lead.email.trim();
  if (!email) return false;
  return defaultEmailBody(lead).length > 0;
}

function OutreachPickCampaignEmpty() {
  const [rows, setRows] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/campaigns?limit=20", { cache: "no-store" });
        const data = (await res.json()) as {
          campaigns?: CampaignSummary[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load campaigns");
        if (!cancelled) setRows(data.campaigns ?? []);
      } catch (e) {
        if (!cancelled)
          setListError(e instanceof Error ? e.message : "Failed to load campaigns");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Pick a campaign</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Outreach Engine needs a campaign. Choose a recent one below, start
          from Prospecting, or append{" "}
          <code className="rounded bg-muted px-1 text-xs">?campaign_id=…</code> to
          the URL.
        </p>
        <Link
          href="/prospecting"
          className={cn(buttonVariants({ variant: "default" }), "mt-4 inline-flex")}
        >
          Go to Prospecting
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Recent campaigns</h2>
        {loading && (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {listError && (
          <p className="mt-3 text-sm text-destructive">{listError}</p>
        )}
        {!loading && !listError && rows.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No campaigns in the database yet. Fetch leads on Prospecting to create
            one.
          </p>
        )}
        {!loading && !listError && rows.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="py-3 first:pt-0">
                <Link
                  href={`/outreach?campaign_id=${encodeURIComponent(c.id)}`}
                  className="group block rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="font-medium text-foreground group-hover:text-primary">
                    {c.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.total_leads} lead{c.total_leads === 1 ? "" : "s"} ·{" "}
                    {c.sent_count} sent · {c.status}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function OutreachEngineClient() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaign_id")?.trim() ?? "";

  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l._id === selectedId) ?? null,
    [leads, selectedId]
  );

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoadError(null);
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/outreach?campaign_id=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        campaign?: CampaignSummary;
        leads?: PipelineLead[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load pipeline");
      setCampaign(data.campaign ?? null);
      try {
        localStorage.setItem("dp_last_campaign_id", campaignId);
      } catch {
        /* ignore */
      }
      setLeads(data.leads ?? []);
      setSelectedId((prev) => {
        if (prev && (data.leads ?? []).some((l) => l._id === prev)) return prev;
        return (data.leads ?? [])[0]?._id ?? null;
      });
    } catch (e) {
      setCampaign(null);
      setLeads([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedLead) {
      setEmailDraft(defaultEmailBody(selectedLead));
    } else {
      setEmailDraft("");
    }
  }, [selectedLead]);

  const patchLead = useCallback(
    async (leadId: string, body: { status?: LeadStatus; approved_variation?: string }) => {
      const res = await fetch(`/api/outreach/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { lead?: PipelineLead; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!data.lead) throw new Error("Invalid response");
      setLeads((prev) =>
        prev.map((l) => (l._id === leadId ? { ...l, ...data.lead! } : l))
      );
      return data.lead;
    },
    []
  );

  const scheduleSaveBody = useCallback(
    (leadId: string, text: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void (async () => {
          try {
            setActionError(null);
            await patchLead(leadId, { approved_variation: text });
          } catch (err) {
            setActionError(err instanceof Error ? err.message : "Save failed");
          }
        })();
      }, 600);
    },
    [patchLead]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const flushSave = useCallback(
    (leadId: string, text: string) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void (async () => {
        try {
          setActionError(null);
          await patchLead(leadId, { approved_variation: text });
        } catch (err) {
          setActionError(err instanceof Error ? err.message : "Save failed");
        }
      })();
    },
    [patchLead]
  );

  const onStatusChange = async (leadId: string, status: LeadStatus) => {
    try {
      setActionError(null);
      await patchLead(leadId, { status });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const generateForSelected = async () => {
    if (!selectedLead?.email.trim()) {
      setActionError("Lead needs an email (enrich on Prospecting first).");
      return;
    }
    setIsGenerating(true);
    setActionError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: [selectedLead._id] }),
      });
      const data = (await res.json()) as { error?: string; processed_count?: number };
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const sendCount = useMemo(() => leads.filter(isReadyToSend).length, [leads]);

  const startCampaign = async () => {
    if (!campaignId || sendCount === 0) return;
    setIsSending(true);
    setActionError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const data = (await res.json()) as {
        error?: string;
        leads_sent?: number;
        instantly_campaign_id?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setIsSending(false);
    }
  };

  if (!campaignId) {
    return (
      <OutreachPickCampaignEmpty />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading pipeline…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
        <Link
          href="/prospecting"
          className={cn(buttonVariants({ variant: "ghost" }), "ml-2")}
        >
          Prospecting
        </Link>
      </div>
    );
  }

  const hasBody = Boolean(
    selectedLead &&
      (defaultEmailBody(selectedLead).length > 0 || emailDraft.trim().length > 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and execute your email campaigns.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Campaign:{" "}
            <span className="font-medium text-foreground">{campaign?.name}</span>
            {" · "}
            <Link href="/prospecting" className="text-primary underline-offset-2 hover:underline">
              Find more leads
            </Link>
          </p>
        </div>
        <Button
          type="button"
          className="gap-2"
          disabled={sendCount === 0 || isSending}
          onClick={() => void startCampaign()}
        >
          {isSending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          Start Campaign
          <span className="rounded-md bg-primary-foreground/20 px-2 py-0.5 text-xs font-medium tabular-nums">
            {sendCount} lead{sendCount === 1 ? "" : "s"}
          </span>
        </Button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead pipeline */}
        <section className="flex min-h-[420px] flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Lead Pipeline</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {leads.length} prospect{leads.length === 1 ? "" : "s"} in queue
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {leads.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No leads in this campaign yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {leads.map((lead) => {
                  const active = lead._id === selectedId;
                  const badge = badgeForStatus(lead.status);
                  return (
                    <li key={lead._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(lead._id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                          active
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "hover:bg-muted/60"
                        )}
                      >
                        <CircleUser
                          className="size-9 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {lead.name || "Unknown"}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="size-3 shrink-0" aria-hidden />
                            {lead.company || "—"}
                          </p>
                        </div>
                        <div
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <select
                            aria-label={`Status for ${lead.name}`}
                            value={lead.status}
                            onChange={(e) =>
                              void onStatusChange(lead._id, e.target.value as LeadStatus)
                            }
                            className={cn(
                              "max-w-[9.5rem] cursor-pointer rounded-md border px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              badge.className
                            )}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Email preview */}
        <section className="flex min-h-[420px] flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Email Preview</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">AI-generated template</p>
          </div>
          <div className="flex flex-1 flex-col p-5">
            {!selectedLead ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Mail className="size-14 opacity-40" />
                <p className="max-w-xs text-sm">
                  Select a lead to preview the email template.
                </p>
              </div>
            ) : !selectedLead.email.trim() ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <Mail className="size-12 opacity-40" />
                <p className="max-w-xs">
                  This lead has no email yet. Go to{" "}
                  <Link href="/prospecting" className="text-primary underline-offset-2 hover:underline">
                    Prospecting
                  </Link>{" "}
                  and enrich selected rows.
                </p>
              </div>
            ) : !hasBody ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <Mail className="size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No email copy yet for{" "}
                  <span className="font-medium text-foreground">{selectedLead.name}</span>.
                </p>
                <Button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void generateForSelected()}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate email"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Edits auto-save. This text is sent as Instantly personalization.
                </p>
                <textarea
                  value={emailDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmailDraft(v);
                    scheduleSaveBody(selectedLead._id, v);
                  }}
                  onBlur={(e) => flushSave(selectedLead._id, e.currentTarget.value)}
                  rows={14}
                  className="min-h-[240px] flex-1 resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
