"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const PLACEHOLDER_RE = /(\{\{\s*(name|company)\s*\}\})/gi;

function highlightPlaceholders(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, PLACEHOLDER_RE.flags);
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    nodes.push(
      <mark
        key={`ph-${key++}`}
        className="rounded bg-primary/20 px-0.5 font-medium text-primary"
      >
        {match[1]}
      </mark>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.length > 0 ? nodes : [text];
}

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
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
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
      } else {
        // No campaign template yet — auto-populate from first lead's generated email
        const leadSubject = data.first_lead?.email_subject ?? "";
        const leadBody = data.first_lead?.email_body ?? "";
        if (leadSubject || leadBody) {
          setSubject(leadSubject);
          setBody(leadBody);
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

  const regenerate = useCallback(async () => {
    if (!campaignId) return;
    setApproveMessage(null);
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
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [campaignId]);

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
      const data = (await res.json()) as {
        error?: string;
        leads_sent?: number;
        instantly_campaign_id?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to send campaign");

      const sent = data.leads_sent ?? 0;
      const instantlyCampaignId = data.instantly_campaign_id ?? "";

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
    <div className="space-y-6">
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <section className="space-y-4 rounded-xl bg-muted/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Template</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void regenerate()}
              disabled={isRegenerating}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1">{"{{name}}"}</code> and{" "}
            <code className="rounded bg-muted px-1">{"{{company}}"}</code>{" "}
            for personalization. Click <span className="font-medium">Regenerate</span>{" "}
            when you want a new AI draft (opening this tab does not run AI).
          </p>

          <div className="space-y-1.5">
            <label htmlFor="subject" className="text-sm font-medium">
              Subject line
            </label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Quick idea for {{company}}"
            />
            <div
              className={cn(
                "min-h-[1.75rem] rounded-md border border-dashed border-border bg-muted/30 px-2 py-1 text-xs leading-relaxed text-muted-foreground"
              )}
              aria-hidden
            >
              {highlightPlaceholders(subject || "")}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="body" className="text-sm font-medium">
              Email body
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={"Hi {{name}},\n\n…"}
            />
            <div
              className={cn(
                "max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-dashed border-border bg-muted/30 px-2 py-2 text-xs leading-relaxed text-muted-foreground"
              )}
              aria-hidden
            >
              {highlightPlaceholders(body || "")}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={() => void approve()}
              disabled={!subject.trim() || isSaving}
              variant="secondary"
            >
              {isSaving ? "Saving…" : "Approve template"}
            </Button>
          </div>
        </section>

        {/* Preview */}
        <section className="space-y-3 rounded-xl bg-muted/40 p-5">
          <h2 className="text-lg font-semibold">Preview</h2>
          <p className="text-xs text-muted-foreground">
            First lead in campaign (placeholders replaced):{" "}
            <span className="font-medium text-foreground">
              {isLoadingCampaign ? "…" : previewLead.name || "Sample"}
            </span>{" "}
            @ {isLoadingCampaign ? "…" : previewLead.company || "Sample Co."}
          </p>
          <div className="rounded-lg border border-border bg-background p-4 text-sm shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject
            </p>
            <p className="mt-1 font-semibold text-foreground">{previewSubject}</p>
            <hr className="my-3 border-border" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Body
            </p>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{previewBody}</p>
          </div>
        </section>
      </div>

      {/* Send panel */}
      <div className="rounded-xl bg-muted/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Ready to send</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {campaign?.total_leads ?? "—"} leads · campaign will launch on Instantly
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="?tab=pipeline"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
            >
              Review emails first →
            </a>
            <Button
              onClick={() => void pushToInstantly()}
              disabled={
                !subject.trim() ||
                !body.trim() ||
                sendState.status === "loading" ||
                sendState.status === "success"
              }
              className="gap-2"
            >
              {sendState.status === "loading"
                ? sendState.step
                : sendState.status === "success"
                  ? `✓ Sent ${sendState.sent} leads`
                  : "Push to Instantly →"}
            </Button>
          </div>
        </div>
        {sendState.status === "error" && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {sendState.message}
          </p>
        )}
        {sendState.status === "success" && (
          <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
            Campaign launched on Instantly ({sendState.sent} leads).{" "}
            <a href="?tab=results" className="font-medium underline underline-offset-2">
              View results →
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
