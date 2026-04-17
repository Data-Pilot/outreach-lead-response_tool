"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CampaignStatus } from "@/components/ui/status-badge";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchCampaigns = () => {
    setLoading(true);
    fetch("/api/campaigns?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(Array.isArray(data) ? data : (data.campaigns ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const openDeleteConfirm = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmId(id);
    setConfirmName(name);
    setConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setConfirmOpen(false);
    setConfirmId(null);
    setConfirmName("");
  };

  const doDelete = async () => {
    if (!confirmId) return;
    setDeletingId(confirmId);
    try {
      const res = await fetch(`/api/campaign/${confirmId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "Failed to delete campaign");
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== confirmId));
    } catch {
      alert("Failed to delete campaign");
    } finally {
      setDeletingId(null);
      closeDeleteConfirm();
    }
  };

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
              <div
                key={c.id}
                className="group relative rounded-xl bg-muted/40 p-4 hover:bg-muted/60 transition-colors"
              >
                <Link
                  href={`/campaigns/${c.id}`}
                  className="block space-y-3 outline-none pr-6"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                      {c.name}
                    </p>
                    <StatusBadge status={c.status as CampaignStatus} />
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

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive"
                  aria-label={`Delete ${c.name}`}
                  disabled={deletingId === c.id}
                  onClick={(e) => openDeleteConfirm(e, c.id, c.name)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title="Delete campaign"
          description={
            <>
              Delete <span className="font-medium text-foreground">{confirmName}</span>? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          isLoading={deletingId === confirmId}
          onConfirm={doDelete}
          onCancel={closeDeleteConfirm}
        />
      </main>
    </AppShell>
  );
}
