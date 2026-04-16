"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  total_leads: number;
  sent_count: number;
  status: string;
  created_at: string;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(Array.isArray(data) ? data : (data.campaigns ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <main className="flex w-full flex-col gap-6">
        <PageHeader
          title="Campaigns"
          subtitle="All outreach campaigns"
          action={
            <Link
              href="/campaigns/new"
              className={cn(buttonVariants({ variant: "default" }), "gap-2")}
            >
              <Plus className="size-4" />
              New Campaign
            </Link>
          }
        />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-muted/40 p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="No campaigns yet"
            description="Create your first campaign to start reaching out."
            action={
              <Link
                href="/campaigns/new"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                New Campaign →
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="group rounded-xl bg-muted/40 p-4 hover:bg-muted/60 transition-colors block space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {c.name}
                  </p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {c.status}
                  </span>
                </div>

                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {c.total_leads} leads
                  </span>
                  {c.sent_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" />
                      {c.sent_count} sent
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
