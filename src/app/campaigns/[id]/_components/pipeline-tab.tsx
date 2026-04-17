"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Lock,
  Loader2,
  Mail,
  Pencil,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { SkeletonRows } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { LeadStatus } from "@/components/ui/status-badge";

type PipelineLead = {
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

type CampaignSummary = {
  id: string;
  name: string;
  total_leads: number;
  sent_count: number;
  status: string;
  created_at: string;
  subject: string;
  body: string;
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "fetched", label: "Pending (fetched)" },
  { value: "reviewed", label: "Pending (reviewed)" },
  { value: "sent", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "bounced", label: "Bounced" },
  { value: "meeting_set", label: "Meeting set" },
];

function applyPlaceholders(text: string, lead: PipelineLead): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name.trim() || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company.trim() || "your company");
}

function defaultEmailBody(lead: PipelineLead, campaignBody: string): string {
  const approved = lead.approved_variation.trim();
  if (approved) return approved;
  if (lead.email_body.trim()) return lead.email_body.trim();
  return applyPlaceholders(campaignBody, lead);
}

function defaultEmailSubject(lead: PipelineLead, campaignSubject: string): string {
  if (lead.email_subject.trim()) return lead.email_subject.trim();
  return applyPlaceholders(campaignSubject, lead);
}


export function PipelineTab({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSave = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const savedIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l._id === selectedId) ?? null,
    [leads, selectedId]
  );

  const load = useCallback(async () => {
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

  // Update emailDraft when selectedLead changes
  useEffect(() => {
    if (selectedLead) {
      setEmailDraft(defaultEmailBody(selectedLead, campaign?.body ?? ""));
      setSubjectDraft(defaultEmailSubject(selectedLead, campaign?.subject ?? ""));
    } else {
      setEmailDraft("");
      setSubjectDraft("");
    }
  }, [selectedLead, campaign]);

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
      hasPendingSave.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        hasPendingSave.current = false;
        void (async () => {
          try {
            setActionError(null);
            await patchLead(leadId, { approved_variation: text });
            setLastSavedAt(new Date());
            if (savedIndicatorTimer.current) clearTimeout(savedIndicatorTimer.current);
            savedIndicatorTimer.current = setTimeout(
              () => setLastSavedAt(null),
              30000
            );
          } catch (err) {
            setActionError(err instanceof Error ? err.message : "Save failed");
          }
        })();
      }, 600);
    },
    [patchLead]
  );

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingSave.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedIndicatorTimer.current) clearTimeout(savedIndicatorTimer.current);
    };
  }, []);

  const flushSave = useCallback(
    (leadId: string, text: string) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        hasPendingSave.current = false;
      }
      void (async () => {
        try {
          setActionError(null);
          await patchLead(leadId, { approved_variation: text });
          setLastSavedAt(new Date());
          if (savedIndicatorTimer.current) clearTimeout(savedIndicatorTimer.current);
          savedIndicatorTimer.current = setTimeout(
            () => setLastSavedAt(null),
            30000
          );
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
      setActionError("This lead has no email — enrich it on the Leads tab first.");
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

  if (isLoading) {
    return (
      <div className="rounded-xl bg-muted/40 overflow-hidden">
        <SkeletonRows count={6} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => void load()} className="px-3">
          Retry
        </Button>
        <Link
          href="/prospecting"
          className={cn(buttonVariants({ variant: "ghost" }), "ml-2 px-3")}
        >
          Prospecting
        </Link>
      </div>
    );
  }

  const hasBody = Boolean(
    selectedLead &&
      (defaultEmailBody(selectedLead, campaign?.body ?? "").length > 0 || emailDraft.trim().length > 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Campaign:{" "}
            <span className="font-medium text-foreground">{campaign?.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Review and edit individual emails below. Send from the{" "}
            <Link href="?tab=template" className="text-primary underline-offset-2 hover:underline">
              Template tab
            </Link>
            .
          </p>
        </div>
        <Link
          href="?tab=results"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
        >
          View results →
        </Link>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead pipeline */}
        <section className="flex min-h-[420px] flex-col rounded-xl bg-muted/40">
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
                        <InitialsAvatar name={lead.name || "?"} size="md" />
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
                          {editingStatusId === lead._id ? (
                            <select
                              aria-label={`Status for ${lead.name}`}
                              value={lead.status}
                              autoFocus
                              onChange={(e) => {
                                void onStatusChange(lead._id, e.target.value as LeadStatus);
                                setEditingStatusId(null);
                              }}
                              onBlur={() => setEditingStatusId(null)}
                              className="max-w-[9.5rem] cursor-pointer rounded-md border border-border bg-background px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => setEditingStatusId(lead._id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setEditingStatusId(lead._id);
                                }
                              }}
                              className="group flex cursor-pointer items-center gap-1"
                              title="Click to edit status"
                            >
                              <StatusBadge status={lead.status} />
                              <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" aria-hidden />
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
        </section>

        {/* Email preview */}
        <section className="flex min-h-[420px] flex-col rounded-xl bg-muted/40">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Email Preview</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">AI-generated email</p>
            </div>
            {lastSavedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Saved at{" "}
                {lastSavedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            {!selectedLead ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Mail className="size-14 opacity-40" />
                <p className="max-w-xs text-sm">
                  Select a lead to preview the email.
                </p>
              </div>
            ) : !selectedLead.email.trim() ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <Mail className="size-12 opacity-40" />
                <p className="max-w-xs">
                  This lead has no email yet. Go to the{" "}
                  <Link href="?tab=leads" className="text-primary underline-offset-2 hover:underline">
                    Leads tab
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
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <Lock className="size-3 text-muted-foreground/60" aria-hidden />
                    <span className="text-xs text-muted-foreground/60">(from template)</span>
                  </div>
                  <input
                    type="text"
                    value={subjectDraft}
                    readOnly
                    className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                  />
                </div>
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
