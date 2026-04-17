"use client";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { SuspenseFallback } from "@/components/ui/page-state";
import { cn } from "@/lib/utils";
import { LeadsTab } from "./_components/leads-tab";
import { TemplateTab } from "./_components/template-tab";
import { PipelineTab } from "./_components/pipeline-tab";
import { ResultsTab } from "./_components/results-tab";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LeadStatus } from "@/components/ui/status-badge";

const TABS = [
  { id: "leads",    label: "1. Leads" },
  { id: "template", label: "2. Template" },
  { id: "pipeline", label: "3. Pipeline" },
  { id: "results",  label: "4. Results" },
] as const;
type TabId = typeof TABS[number]["id"];

type CampaignSummary = {
  id: string;
  name: string;
  job_roles: string[];
  industry: string;
  total_leads: number;
  status: string;
  subject?: string;
  body?: string;
};

function CampaignPageInner() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: TabId = (searchParams.get("tab") as TabId) ?? "leads";

  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await fetch(`/api/campaign/${id}`);
      const data = (await res.json()) as {
        error?: string;
        campaign?: CampaignSummary;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load campaign");
      setCampaign(data.campaign ?? null);
    } catch (e) {
      setCampaign(null);
      setLoadError(e instanceof Error ? e.message : "Failed to load campaign");
    }
  }, [id]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  const handleTabClick = (tabId: TabId) => {
    router.push(`/campaigns/${id}?tab=${tabId}`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Campaign subheader */}
        <div
          className="mb-6 rounded-lg bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          aria-busy={!campaign && !loadError}
        >
          {campaign ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">{campaign.name}</span>
                {campaign.job_roles.length > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {campaign.job_roles.join(", ")}
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {campaign.industry && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {campaign.industry}
                  </span>
                )}
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {campaign.total_leads.toLocaleString()} leads
                </span>
                <StatusBadge status={campaign.status as LeadStatus} />
              </div>
            </>
          ) : loadError ? (
            <span className="text-sm text-destructive">{loadError}</span>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-40 sm:w-56" />
                <span className="hidden text-muted-foreground sm:inline" aria-hidden>
                  ·
                </span>
                <Skeleton className="h-4 w-32 max-w-[40%]" />
              </div>
              <div className="flex flex-wrap items-center gap-2" aria-hidden>
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <span className="sr-only">Loading campaign</span>
            </>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "px-4 py-2 text-sm transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "leads" && <LeadsTab campaignId={id} />}
        {activeTab === "template" && (
          <TemplateTab campaignId={id} campaign={campaign} />
        )}
        {activeTab === "pipeline" && <PipelineTab campaignId={id} />}
        {activeTab === "results" && (
          <ResultsTab campaignId={id} />
        )}
      </div>
    </AppShell>
  );
}

export default function CampaignPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <SuspenseFallback />
        </AppShell>
      }
    >
      <CampaignPageInner />
    </Suspense>
  );
}
