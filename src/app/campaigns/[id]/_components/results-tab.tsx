"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstantlyStats = {
  sent?: number;
  opened?: number;
  replied?: number;
};

type Props = {
  campaignId: string;
};

export function ResultsTab({ campaignId }: Props) {
  const [stats, setStats] = useState<InstantlyStats | null>(null);
  const [localSentCount, setLocalSentCount] = useState<number>(0);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dp_sent_log");
      if (raw) {
        const log = JSON.parse(raw) as { instantly_campaign_id?: string }[];
        const count = log.filter(
          (entry) => entry.instantly_campaign_id === campaignId
        ).length;
        setLocalSentCount(count);
      }
    } catch {
      // localStorage unavailable — non-fatal
    }
  }, [campaignId]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/instantly?campaign_id=${encodeURIComponent(campaignId)}`);
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = (await res.json()) as InstantlyStats;
      if (data.sent == null && data.opened == null && data.replied == null) {
        setFetchError(true);
      } else {
        setStats(data);
        setLastRefreshed(new Date());
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const sentValue = stats?.sent ?? localSentCount;
  const isEmpty = fetchError && localSentCount === 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-muted/40 p-5 space-y-3 animate-pulse">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-8 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-xl bg-muted/40 p-8 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Launch the campaign from the Template tab to see results here.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchStats()}
          className="gap-2"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
    );
  }

  const metrics = [
    {
      label: "Emails Sent",
      value: sentValue != null ? sentValue.toLocaleString() : "—",
    },
    {
      label: "Opens",
      value: stats?.opened != null ? stats.opened.toLocaleString() : "—",
    },
    {
      label: "Replies",
      value: stats?.replied != null ? stats.replied.toLocaleString() : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl bg-muted/40 p-5 space-y-1"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </p>
            <p className="text-3xl font-semibold text-foreground">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {lastRefreshed ? (
          <span>Last refreshed {lastRefreshed.toLocaleTimeString()}</span>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void fetchStats()}
          disabled={loading}
          className="gap-1.5 h-7 px-2 text-xs"
        >
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
