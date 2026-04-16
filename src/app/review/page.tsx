"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CampaignPayload = {
  id: string;
  name: string;
  job_roles: string[];
  industry: string;
  total_leads: number;
};

type FirstLead = {
  name: string;
  company: string;
  email: string;
  role: string;
  location: string;
};

type CampaignLead = {
  _id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  location: string;
  linkedin_url: string;
  phone: string;
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

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaign_id")?.trim() ?? "";

  const [campaign, setCampaign] = useState<CampaignPayload | null>(null);
  const [firstLead, setFirstLead] = useState<FirstLead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoadError(null);
    setIsLoadingCampaign(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}`);
      const data = (await res.json()) as {
        error?: string;
        campaign?: CampaignPayload;
        first_lead?: FirstLead | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load campaign");
      }
      if (data.campaign) {
        setCampaign(data.campaign);
      }
      setFirstLead(data.first_lead ?? null);
    } catch (e) {
      setCampaign(null);
      setFirstLead(null);
      setLoadError(e instanceof Error ? e.message : "Failed to load campaign");
    } finally {
      setIsLoadingCampaign(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    if (!campaignId) return;
    try {
      localStorage.setItem("dp_last_campaign_id", campaignId);
    } catch {
      /* ignore */
    }
  }, [campaignId]);

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
      if (!res.ok) {
        throw new Error(data.error ?? "Regeneration failed");
      }
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    try {
      const raw = sessionStorage.getItem(`approved_template_${campaignId}`);
      if (!raw) {
        setSubject("");
        setBody("");
        return;
      }
      const parsed = JSON.parse(raw) as { subject?: string; body?: string };
      setSubject(typeof parsed.subject === "string" ? parsed.subject : "");
      setBody(typeof parsed.body === "string" ? parsed.body : "");
    } catch {
      setSubject("");
      setBody("");
    }
  }, [campaignId]);

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

  const approve = () => {
    if (!campaignId) return;
    try {
      sessionStorage.setItem(
        `approved_template_${campaignId}`,
        JSON.stringify({
          subject,
          body,
          approved_at: new Date().toISOString(),
        })
      );
      setApproveMessage("Template approved.");
    } catch {
      setApproveMessage("Could not save approval to browser storage.");
    }
  };

  const pushToInstantly = async () => {
    if (!campaignId || !campaign) return;
    setSendState({ status: "loading", step: "Fetching leads…" });
    try {
      // 1. Fetch all enriched leads for this campaign
      const leadsRes = await fetch(`/api/campaign/${campaignId}/leads`);
      const leadsData = (await leadsRes.json()) as {
        leads?: CampaignLead[];
        error?: string;
      };
      if (!leadsRes.ok) throw new Error(leadsData.error ?? "Failed to load leads");
      const leads = leadsData.leads ?? [];
      if (leads.length === 0) {
        throw new Error("No leads with emails found. Enrich leads first.");
      }

      // 2. Create an Instantly campaign
      setSendState({ status: "loading", step: "Creating Instantly campaign…" });
      const createRes = await fetch("/api/instantly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createCampaign", name: campaign.name }),
      });
      const createData = (await createRes.json()) as { id?: string; error?: string };
      if (!createRes.ok) throw new Error(createData.error ?? "Failed to create campaign");
      const instantlyCampaignId = createData.id ?? "";
      if (!instantlyCampaignId) throw new Error("Instantly did not return a campaign id");

      // 3. Add leads
      setSendState({ status: "loading", step: `Adding ${leads.length} leads…` });
      const addRes = await fetch("/api/instantly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLeads",
          campaign_id: instantlyCampaignId,
          leads: leads.map((l) => ({
            email: l.email,
            first_name: l.name.split(" ")[0] ?? l.name,
            last_name: l.name.split(" ").slice(1).join(" "),
            company_name: l.company,
            website: "",
            custom_variables: {
              role: l.role,
              location: l.location,
              linkedin_url: l.linkedin_url,
            },
          })),
        }),
      });
      const addData = (await addRes.json()) as { error?: string };
      if (!addRes.ok) throw new Error(addData.error ?? "Failed to add leads");

      // 4. Launch
      setSendState({ status: "loading", step: "Launching campaign…" });
      const launchRes = await fetch("/api/instantly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "launchCampaign",
          campaign_id: instantlyCampaignId,
        }),
      });
      const launchData = (await launchRes.json()) as { error?: string };
      if (!launchRes.ok) throw new Error(launchData.error ?? "Failed to launch campaign");

      // 5. Write dp_sent_log to localStorage so the Chrome extension can detect matches
      try {
        const existing = JSON.parse(
          localStorage.getItem("dp_sent_log") ?? "[]"
        ) as unknown[];
        const entries = leads.map((l) => ({
          linkedin_url: l.linkedin_url,
          email: l.email,
          name: l.name,
          company: l.company,
          sent_at: new Date().toISOString(),
          instantly_campaign_id: instantlyCampaignId,
        }));
        localStorage.setItem(
          "dp_sent_log",
          JSON.stringify([...existing, ...entries])
        );
      } catch {
        // localStorage unavailable — non-fatal
      }

      setSendState({
        status: "success",
        sent: leads.length,
        instantly_campaign_id: instantlyCampaignId,
      });
    } catch (e) {
      setSendState({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  };

  if (!campaignId) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Review</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open this page with a campaign id, for example{" "}
            <code className="rounded bg-muted px-1">/review?campaign_id=…</code>
            . After fetching leads, use the link from Prospecting.
          </p>
          <Link
            href="/prospecting"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4 inline-flex")}
          >
            Back to Prospecting
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Review email template</h1>
            <p className="text-sm text-muted-foreground">
              Campaign{" "}
              <span className="text-foreground">{campaign?.name ?? "…"}</span>
            </p>
          </div>
          <Link
            href="/prospecting"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Prospecting
          </Link>
        </div>

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

        <div className="rounded-lg bg-muted/40 px-4 py-2.5 text-sm flex flex-wrap items-center gap-3">
          {isLoadingCampaign && !campaign ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : campaign ? (
            <>
              <span className="font-medium text-foreground">{campaign.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {campaign.job_roles.length > 0 ? campaign.job_roles.join(", ") : "—"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {campaign.total_leads.toLocaleString()} leads
              </span>
            </>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
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
              when you want a new AI draft (opening this page does not run AI).
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
              <Button type="button" onClick={approve} disabled={!subject.trim()} variant="secondary">
                Approve template
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-xl bg-muted/40 p-5">
            <h2 className="text-lg font-semibold">Preview</h2>
            <p className="text-xs text-muted-foreground">
              First lead in campaign (placeholders replaced):{" "}
              <span className="font-medium text-foreground">
                {previewLead.name || "Sample"}
              </span>{" "}
              @ {previewLead.company || "Sample Co."}
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

        <div className="rounded-xl bg-muted/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Ready to send</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {campaign?.total_leads} leads · campaign will launch on Instantly
              </p>
            </div>
            <Button
              onClick={() => void pushToInstantly()}
              disabled={
                !subject.trim() ||
                sendState.status === "loading" ||
                sendState.status === "success"
              }
              className="gap-2 shrink-0"
            >
              {sendState.status === "loading"
                ? sendState.step
                : sendState.status === "success"
                  ? `✓ Sent ${sendState.sent} leads`
                  : "Push to Instantly →"}
            </Button>
          </div>
          {sendState.status === "error" && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {sendState.message}
            </p>
          )}
          {sendState.status === "success" && (
            <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
              Campaign launched on Instantly ({sendState.sent} leads). dp_sent_log updated — the Chrome extension can now detect these contacts on LinkedIn.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background p-8 text-muted-foreground">
          Loading review…
        </div>
      }
    >
      <ReviewPageInner />
    </Suspense>
  );
}
