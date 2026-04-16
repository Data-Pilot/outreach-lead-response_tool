"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    // Read dp_sent_log from localStorage
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

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setFetchError(false);
      try {
        const res = await fetch(`/api/instantly?campaign_id=${encodeURIComponent(campaignId)}`);
        if (!res.ok) {
          setFetchError(true);
          return;
        }
        const data = (await res.json()) as InstantlyStats;
        // Treat empty/no data as an empty-state signal
        if (
          data.sent == null &&
          data.opened == null &&
          data.replied == null
        ) {
          setFetchError(true);
        } else {
          setStats(data);
        }
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [campaignId]);

  const sentValue = stats?.sent ?? localSentCount;

  // Empty state: no stats and nothing in localStorage
  const isEmpty = fetchError && localSentCount === 0;

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading results…</p>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-xl bg-muted/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Launch the campaign from the Template or Pipeline tab to see results here.
        </p>
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
    </div>
  );
}
