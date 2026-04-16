"use client";

import { useEffect, useState } from "react";
import { BarChart3, Mail, Puzzle, TrendingUp } from "lucide-react";
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

type DpConfig = {
  daily_linkedin_limit: number;
};

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

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-muted/40 p-5",
        accent && "bg-primary/8 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon
          className={cn("size-4", accent ? "text-primary" : "text-muted-foreground")}
        />
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          accent && "text-primary"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function FunnelPage() {
  const [sentLog, setSentLog] = useState<SentEntry[]>([]);
  const [bridgeLog, setBridgeLog] = useState<BridgeEntry[]>([]);
  const [config, setConfig] = useState<DpConfig>({ daily_linkedin_limit: 20 });

  useEffect(() => {
    setSentLog(readLocal<SentEntry[]>("dp_sent_log", []));
    setBridgeLog(readLocal<BridgeEntry[]>("dp_bridge_log", []));
    setConfig(readLocal<DpConfig>("dp_config", { daily_linkedin_limit: 20 }));
  }, []);

  const totalEmailed = sentLog.length;
  const totalBridged = bridgeLog.length;
  const bridgeCoverage =
    totalEmailed > 0 ? Math.round((totalBridged / totalEmailed) * 100) : 0;
  const dailyLimit = config.daily_linkedin_limit ?? 20;

  const todayBridged = bridgeLog.filter((e) => {
    const d = new Date(e.bridged_at);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;

  const safetyPct = Math.min(100, Math.round((todayBridged / dailyLimit) * 100));
  const safetyColor =
    safetyPct >= 90
      ? "bg-destructive"
      : safetyPct >= 65
        ? "bg-amber-400"
        : "bg-primary";

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
        channel: b?.channel ?? "",
        lastActivity: new Date(b?.bridged_at ?? s?.sent_at ?? 0).getTime(),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Funnel</h1>
          <p className="mt-1 text-muted-foreground">
            Live view of your multi-channel outreach pipeline.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={Mail}
            label="Total Emails Sent"
            value={totalEmailed}
            sub="via Instantly campaigns"
            accent
          />
          <MetricCard
            icon={Puzzle}
            label="Bridges Built"
            value={totalBridged}
            sub="LinkedIn follow-ups sent"
          />
          <MetricCard
            icon={TrendingUp}
            label="Bridge Coverage"
            value={totalEmailed > 0 ? `${bridgeCoverage}%` : "—"}
            sub="of emailed leads followed up on LinkedIn"
          />
        </div>

        <div className="rounded-xl bg-muted/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Daily LinkedIn Safety Zone</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {todayBridged} of {dailyLimit} outreaches used today
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                safetyPct >= 90
                  ? "bg-destructive/10 text-destructive"
                  : safetyPct >= 65
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              )}
            >
              {safetyPct >= 90
                ? "⚠ Approaching limit"
                : safetyPct >= 65
                  ? "Moderate"
                  : "Safe"}
            </span>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-500", safetyColor)}
              style={{ width: `${safetyPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>Daily limit: {dailyLimit}</span>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Activity Feed</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {feed.length} contact{feed.length !== 1 ? "s" : ""} in pipeline
            </p>
          </div>
          {feed.length === 0 ? (
            <EmptyState
              icon={<BarChart3 />}
              title="No activity yet"
              description="Push a campaign to Instantly and use The Bridge on LinkedIn to see data here."
              action={
                <Link href="/prospecting" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
                  Start prospecting →
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((row) => (
                <li
                  key={row.url}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    {row.company && (
                      <p className="truncate text-xs text-muted-foreground">
                        {row.company}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                        row.emailed
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Mail className="size-3" />
                      {row.emailed ? "Email Sent ✓" : "Not emailed"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                        row.bridged
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Puzzle className="size-3" />
                      {row.bridged
                        ? `Bridge ✓${row.channel ? ` (${row.channel})` : ""}`
                        : "No bridge yet"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
