"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type FirstLead = {
  name: string;
  company: string;
  email: string;
  role: string;
  location: string;
  email_subject?: string;
  email_body?: string;
};

type SendState =
  | { status: "idle" }
  | { status: "loading"; step: string }
  | { status: "success"; sent: number; instantly_campaign_id: string }
  | { status: "error"; message: string };

type SentLead = {
  email: string;
  name: string;
  company: string;
  linkedin_url: string;
};

function applyPlaceholders(
  text: string,
  lead: { name: string; company: string }
): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name.trim() || "there")
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company.trim() || "your company");
}

type Props = {
  campaignId: string;
  campaign: {
    name: string;
    job_roles: string[];
    industry: string;
    total_leads: number;
    subject?: string;
    body?: string;
  } | null;
};

export function TemplateTab({ campaignId, campaign }: Props) {
  const [firstLead, setFirstLead] = useState<FirstLead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");

  // Track the last-saved values to detect dirty state
  const savedSubjectRef = useRef(campaign?.subject ?? "");
  const savedBodyRef = useRef(campaign?.body ?? "");

  const isDirty =
    subject !== savedSubjectRef.current || body !== savedBodyRef.current;

  const [isLoadingCampaign, setIsLoadingCampaign] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load first lead for preview
  const loadFirstLead = useCallback(async () => {
    if (!campaignId) return;
    setIsLoadingCampaign(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}`);
      const data = (await res.json()) as {
        error?: string;
        first_lead?: FirstLead | null;
        campaign?: { subject?: string; body?: string } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load campaign");
      setFirstLead(data.first_lead ?? null);

      const campaignSubject = data.campaign?.subject ?? "";
      const campaignBody = data.campaign?.body ?? "";

      if (campaignSubject || campaignBody) {
        setSubject(campaignSubject);
        setBody(campaignBody);
        savedSubjectRef.current = campaignSubject;
        savedBodyRef.current = campaignBody;
      } else {
        // No campaign template yet — auto-populate from first lead's generated email
        const leadSubject = data.first_lead?.email_subject ?? "";
        const leadBody = data.first_lead?.email_body ?? "";
        if (leadSubject || leadBody) {
          setSubject(leadSubject);
          setBody(leadBody);
          savedSubjectRef.current = leadSubject;
          savedBodyRef.current = leadBody;
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load campaign");
    } finally {
      setIsLoadingCampaign(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadFirstLead();
  }, [loadFirstLead]);

  const doRegenerate = useCallback(async () => {
    if (!campaignId) return;
    setApproveMessage(null);
    setShowRegenerateConfirm(false);
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/review/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const data = (await res.json()) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
      const newSubject = data.subject ?? "";
      const newBody = data.body ?? "";
      setSubject(newSubject);
      setBody(newBody);
      // After regenerate the new draft becomes the "saved" baseline
      savedSubjectRef.current = newSubject;
      savedBodyRef.current = newBody;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [campaignId]);

  const handleRegenerateClick = () => {
    if (isDirty) {
      setShowRegenerateConfirm(true);
    } else {
      void doRegenerate();
    }
  };

  const saveTemplate = async (newSubject: string, newBody: string) => {
    if (!campaignId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject, body: newBody }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      savedSubjectRef.current = newSubject;
      savedBodyRef.current = newBody;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const previewLead = useMemo(
    () =>
      firstLead ?? {
        name: "Jordan Lee",
        company: "Acme Labs",
        email: "jordan@example.com",
        role: "Head of Marketing",
        location: "Austin, US",
      },
    [firstLead]
  );

  const previewSubject = applyPlaceholders(subject, previewLead);
  const previewBody = applyPlaceholders(body, previewLead);

  const [sendState, setSendState] = useState<SendState>({ status: "idle" });

  const approve = async () => {
    if (!campaignId) return;
    await saveTemplate(subject, body);
    setApproveMessage("Template approved and saved.");
  };

  const pushToInstantly = async () => {
    if (!campaignId || !campaign) return;
    // Ensure template is saved before sending
    await saveTemplate(subject, body);
    setSendState({ status: "loading", step: "Sending campaign…" });
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });

      setSendState({ status: "loading", step: "Updating statuses…" });

      const data = (await res.json()) as {
        error?: string;
        leads_sent?: number;
        instantly_campaign_id?: string;
        sent_leads?: SentLead[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to send campaign");

      const sent = data.leads_sent ?? 0;
      const instantlyCampaignId = data.instantly_campaign_id ?? "";

      // Write dp_sent_log to localStorage for Funnel dashboard
      if (data.sent_leads && data.sent_leads.length > 0) {
        try {
          const existing = JSON.parse(
            localStorage.getItem("dp_sent_log") ?? "[]"
          ) as unknown[];
          const newEntries = data.sent_leads.map((l) => ({
            linkedin_url: l.linkedin_url ?? "",
            email: l.email,
            name: l.name,
            company: l.company,
            sent_at: new Date().toISOString(),
            instantly_campaign_id: instantlyCampaignId,
          }));
          localStorage.setItem(
            "dp_sent_log",
            JSON.stringify([...existing, ...newEntries])
          );
        } catch {
          /* non-fatal */
        }
      }

      setSendState({
        status: "success",
        sent,
        instantly_campaign_id: instantlyCampaignId,
      });
    } catch (e) {
      setSendState({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  };

  return (
    <div className="space-y-4">
      {sendState.status === "success" && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50 px-4 py-3 text-teal-900">
          <p className="text-sm font-semibold">
            ✓ {sendState.sent} leads marked as sent.{" "}
            <span className="font-normal text-teal-700">Logged to your Funnel dashboard.</span>
          </p>
          <a
            href="?tab=results"
            className="shrink-0 text-sm font-semibold text-teal-800 underline underline-offset-2 hover:no-underline"
          >
            View results →
          </a>
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {approveMessage && (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {approveMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor */}
        <section className="space-y-3 rounded-xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Template</h2>
            <div className="flex items-center gap-2">
              {showRegenerateConfirm ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  <span>This will overwrite your draft.</span>
                  <button
                    onClick={() => void doRegenerate()}
                    className="font-semibold underline underline-offset-2"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={() => setShowRegenerateConfirm(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRegenerateClick}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? "Regenerating…" : "Regenerate"}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1">{"{{name}}"}</code> and{" "}
            <code className="rounded bg-muted px-1">{"{{company}}"}</code>{" "}
            for personalization. Click <span className="font-medium">Regenerate</span>{" "}
            for a new AI draft.
          </p>

          <div className="space-y-1">
            <label htmlFor="subject" className="text-sm font-medium">
              Subject line
            </label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Quick idea for {{company}}"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="body" className="text-sm font-medium">
              Email body
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={"Hi {{name}},\n\n…"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void approve()}
              disabled={!subject.trim() || isSaving}
              variant="secondary"
              size="sm"
            >
              {isSaving ? "Saving…" : "Approve template"}
            </Button>
            {isDirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
          </div>
        </section>

        {/* Preview */}
        <section className="space-y-2 rounded-xl bg-muted/40 p-4">
          <h2 className="text-base font-semibold">Preview</h2>
          <p className="text-xs text-muted-foreground">
            First lead (placeholders replaced):{" "}
            <span className="font-medium text-foreground">
              {isLoadingCampaign ? "…" : previewLead.name || "Sample"}
            </span>{" "}
            @ {isLoadingCampaign ? "…" : previewLead.company || "Sample Co."}
            {!firstLead && !isLoadingCampaign && (
              <span className="ml-1 italic">(sample)</span>
            )}
          </p>
          <div className="rounded-lg border border-border bg-background p-3 text-sm shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject
            </p>
            <p className="mt-0.5 font-semibold text-foreground">{previewSubject}</p>
            <hr className="my-2 border-border" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Body
            </p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{previewBody}</p>
          </div>
        </section>
      </div>

      {/* Send panel */}
      <div className="rounded-xl bg-muted/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Ready to send</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign?.total_leads ?? "—"} leads · statuses will update in your dashboard
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="?tab=pipeline"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
            >
              Review emails first →
            </a>
            {sendState.status === "success" ? (
              <a
                href="?tab=results"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                View results →
              </a>
            ) : (
              <Button
                onClick={() => void pushToInstantly()}
                disabled={
                  !subject.trim() ||
                  !body.trim() ||
                  sendState.status === "loading"
                }
                className="gap-2"
              >
                {sendState.status === "loading"
                  ? sendState.step
                  : "Send campaign →"}
              </Button>
            )}
          </div>
        </div>
        {sendState.status === "error" && !sendState.message.includes("already been contacted") && (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            <p className="flex-1 text-xs text-destructive">{sendState.message}</p>
            <button
              onClick={() => void pushToInstantly()}
              className="shrink-0 text-xs font-medium text-destructive underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
