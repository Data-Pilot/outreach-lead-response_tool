"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Mail,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

type SentEntry = {
  linkedin_url: string;
  email: string;
  name: string;
  company: string;
  sent_at: string;
  instantly_campaign_id?: string;
};

type BridgeEntry = {
  linkedin_url: string;
  name: string;
  channel: string;
  bridged_at: string;
};

type ServerFunnelMetrics = {
  prospects: number;
  contacted: number;
  replied: number;
  meetings: number;
  emails_sent: number;
};

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function countInWindow(
  entries: { at: string }[],
  startMs: number,
  endMs: number
): number {
  return entries.filter((e) => {
    const t = new Date(e.at).getTime();
    return t >= startMs && t < endMs;
  }).length;
}

function formatWeekTrend(current: number, previous: number): string {
  if (current === 0 && previous === 0) return "No activity last 2 weeks";
  if (previous === 0 && current > 0) return "+100% from last week";
  const raw = Math.round(((current - previous) / previous) * 100);
  const sign = raw > 0 ? "+" : "";
  return `${sign}${raw}% from last week`;
}

function weekTrendMeta(current: number, previous: number) {
  const label = formatWeekTrend(current, previous);
  const flat = current === 0 && previous === 0;
  return {
    label,
    up: flat ? null : (current >= previous),
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatRelative(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function KpiCard({
  label,
  value,
  trendLabel,
  trendUp,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  trendLabel: string;
  trendUp: boolean | null;
  icon: typeof Mail;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
            {trendUp === null ? (
              <span className="text-muted-foreground">{trendLabel}</span>
            ) : (
              <>
                {trendUp ? (
                  <TrendingUp className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <TrendingDown className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                )}
                <span
                  className={cn(
                    trendUp ? "text-emerald-600" : "text-amber-600"
                  )}
                >
                  {trendLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
          aria-hidden
        >
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function FunnelStageRow({
  label,
  count,
  pctOfTop,
  showArrow,
}: {
  label: string;
  count: number;
  pctOfTop: number;
  showArrow: boolean;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(pctOfTop)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-4 tabular-nums">
          <span className="text-xs font-semibold text-primary">{pct}%</span>
          <span className="min-w-[1.75rem] text-right text-sm font-semibold text-muted-foreground">
            {count}
          </span>
        </div>
      </div>
      <div className="h-11 overflow-hidden rounded-xl bg-muted/80">
        <div
          className="h-full rounded-xl bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showArrow && (
        <div className="flex justify-center py-1.5 text-muted-foreground/70">
          <ChevronDown className="size-4" aria-hidden />
        </div>
      )}
    </div>
  );
}

export default function FunnelPage() {
  const [sentLog, setSentLog] = useState<SentEntry[]>([]);
  const [bridgeLog, setBridgeLog] = useState<BridgeEntry[]>([]);
  const [serverMetrics, setServerMetrics] = useState<ServerFunnelMetrics | null>(
    null
  );
  const [serverLoaded, setServerLoaded] = useState(false);

  useEffect(() => {
    setSentLog(readLocal<SentEntry[]>("dp_sent_log", []));
    setBridgeLog(readLocal<BridgeEntry[]>("dp_bridge_log", []));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/funnel-metrics");
        if (!res.ok) {
          setServerMetrics(null);
          return;
        }
        const data = (await res.json()) as ServerFunnelMetrics;
        setServerMetrics(data);
      } catch {
        setServerMetrics(null);
      } finally {
        setServerLoaded(true);
      }
    })();
  }, []);

  const totalEmailedLocal = sentLog.length;
  const totalBridged = bridgeLog.length;
  const emailsSentDisplay = Math.max(
    serverMetrics?.emails_sent ?? 0,
    totalEmailedLocal
  );
  const bridgeCoverage =
    emailsSentDisplay > 0
      ? Math.round((totalBridged / emailsSentDisplay) * 100)
      : 0;

  const sentWithAt = useMemo(
    () => sentLog.map((e) => ({ at: e.sent_at })),
    [sentLog]
  );
  const bridgeWithAt = useMemo(
    () => bridgeLog.map((e) => ({ at: e.bridged_at })),
    [bridgeLog]
  );

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const emailTrend = useMemo(() => {
    const now = Date.now();
    const cur = countInWindow(sentWithAt, now - weekMs, now);
    const prev = countInWindow(sentWithAt, now - 2 * weekMs, now - weekMs);
    return weekTrendMeta(cur, prev);
  }, [sentWithAt, weekMs]);

  const bridgeTrend = useMemo(() => {
    const now = Date.now();
    const cur = countInWindow(bridgeWithAt, now - weekMs, now);
    const prev = countInWindow(bridgeWithAt, now - 2 * weekMs, now - weekMs);
    return weekTrendMeta(cur, prev);
  }, [bridgeWithAt, weekMs]);

  const coverageTrend = useMemo(() => {
    const now = Date.now();
    const sentCur = countInWindow(sentWithAt, now - weekMs, now);
    const sentPrev = countInWindow(sentWithAt, now - 2 * weekMs, now - weekMs);
    const brCur = countInWindow(bridgeWithAt, now - weekMs, now);
    const brPrev = countInWindow(bridgeWithAt, now - 2 * weekMs, now - weekMs);
    const covCur = sentCur > 0 ? brCur / sentCur : 0;
    const covPrev = sentPrev > 0 ? brPrev / sentPrev : 0;
    if (sentCur === 0 && sentPrev === 0) {
      return { label: "No sends last 2 weeks", up: null as boolean | null };
    }
    if (sentPrev === 0) return { label: "+100% from last week", up: true };
    if (covPrev === 0) {
      if (covCur === 0) {
        return { label: "Same coverage as last week", up: null as boolean | null };
      }
      return { label: "+100% from last week", up: true };
    }
    const raw = Math.round(((covCur - covPrev) / covPrev) * 100);
    const sign = raw > 0 ? "+" : "";
    return {
      label: `${sign}${raw}% from last week`,
      up: covCur >= covPrev,
    };
  }, [sentWithAt, bridgeWithAt, weekMs]);

  const sentMap = new Map(sentLog.map((e) => [e.linkedin_url, e]));
  const bridgeMap = new Map(bridgeLog.map((e) => [e.linkedin_url, e]));
  const allUrls = Array.from(
    new Set([
      ...sentLog.map((e) => e.linkedin_url),
      ...bridgeLog.map((e) => e.linkedin_url),
    ])
  );

  const feed = allUrls
    .map((url) => {
      const s = sentMap.get(url);
      const b = bridgeMap.get(url);
      return {
        url,
        name: s?.name ?? b?.name ?? url,
        company: s?.company ?? "",
        emailed: Boolean(s),
        bridged: Boolean(b),
        lastActivity: new Date(b?.bridged_at ?? s?.sent_at ?? 0).getTime(),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  const hasServerPipeline =
    serverLoaded &&
    serverMetrics != null &&
    (serverMetrics.prospects > 0 || serverMetrics.emails_sent > 0);

  const prospectCount = hasServerPipeline
    ? serverMetrics!.prospects
    : Math.max(allUrls.length, totalEmailedLocal, totalBridged);

  const contactedCount = hasServerPipeline
    ? serverMetrics!.contacted
    : totalEmailedLocal;

  const repliedCount = hasServerPipeline ? serverMetrics!.replied : 0;
  const meetingCount = hasServerPipeline ? serverMetrics!.meetings : 0;

  const top = Math.max(prospectCount, 1);
  const stages = [
    {
      key: "prospects",
      label: "Prospects",
      count: prospectCount,
      pct: 100,
    },
    {
      key: "contacted",
      label: "Contacted",
      count: contactedCount,
      pct: (contactedCount / top) * 100,
    },
    {
      key: "replied",
      label: "Replied",
      count: repliedCount,
      pct: (repliedCount / top) * 100,
    },
    {
      key: "meeting",
      label: "Meeting",
      count: meetingCount,
      pct: (meetingCount / top) * 100,
    },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Funnel Dashboard
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Track your outreach performance
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Total Emails Sent"
            value={emailsSentDisplay}
            trendLabel={emailTrend.label}
            trendUp={emailTrend.up}
            icon={Mail}
          />
          <KpiCard
            label="Bridges Built"
            value={totalBridged}
            trendLabel={bridgeTrend.label}
            trendUp={bridgeTrend.up}
            icon={Users}
          />
          <KpiCard
            label="Coverage %"
            value={emailsSentDisplay > 0 ? `${bridgeCoverage}%` : "—"}
            trendLabel={coverageTrend.label}
            trendUp={coverageTrend.up}
            icon={BarChart3}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                Conversion Funnel
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Prospect journey visualization
              </p>
            </div>
            {!hasServerPipeline && prospectCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Pipeline stages appear when you add leads to a campaign or record
                extension activity.
              </p>
            ) : (
              <div className="space-y-0">
                {stages.map((s, i) => (
                  <FunnelStageRow
                    key={s.key}
                    label={s.label}
                    count={s.count}
                    pctOfTop={s.pct}
                    showArrow={i < stages.length - 1}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/80 px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground">
                Activity Feed
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Recent outreach activity
              </p>
            </div>
            {feed.length === 0 ? (
              <EmptyState
                icon={<BarChart3 />}
                title="No activity yet"
                description="Push a campaign to Instantly and use The Bridge on LinkedIn to see data here."
                action={
                  <Link
                    href="/prospecting"
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" })
                    )}
                  >
                    Start prospecting →
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border/80">
                {feed.map((row) => (
                  <li
                    key={row.url}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
                      aria-hidden
                    >
                      {initials(row.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {row.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(row.lastActivity)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/8 text-primary",
                          !row.emailed && "opacity-40"
                        )}
                        title={row.emailed ? "Emailed" : "Not emailed"}
                      >
                        <Mail className="size-4" aria-hidden />
                      </span>
                      <a
                        href={
                          row.url.startsWith("http")
                            ? row.url
                            : `https://${row.url}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/8 text-primary outline-none ring-offset-background hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring",
                          !row.bridged && "pointer-events-none opacity-40"
                        )}
                        title="LinkedIn profile"
                        aria-label={`Open LinkedIn for ${row.name}`}
                      >
                        <LinkedInGlyph className="size-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
