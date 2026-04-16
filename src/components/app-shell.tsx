"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BarChart3, ChevronDown, LogOut, Mail, Puzzle, Search, Zap } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkflowJourney } from "@/components/workflow-journey";

type NavItem = { href: string; label: string; icon?: LucideIcon };

const primaryNav: NavItem[] = [
  { href: "/", label: "Command Center" },
  { href: "/prospecting", label: "Prospecting", icon: Search },
  { href: "/outreach", label: "Outreach Engine", icon: Mail },
];

const moreNav: NavItem[] = [
  { href: "/bridge", label: "The Bridge", icon: Puzzle },
  { href: "/funnel", label: "Funnel", icon: BarChart3 },
];

type DpConfig = { tone?: string; context?: string };

function readDpConfig(): DpConfig | null {
  try {
    const raw = localStorage.getItem("dp_config");
    if (!raw) return null;
    return JSON.parse(raw) as DpConfig;
  } catch {
    return null;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const [identity, setIdentity] = useState<DpConfig | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement>(null);

  const refreshIdentity = useCallback(() => {
    setIdentity(readDpConfig());
  }, []);

  useEffect(() => {
    refreshIdentity();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dp_config" || e.key === null) refreshIdentity();
    };
    const onDpConfig = () => refreshIdentity();
    window.addEventListener("storage", onStorage);
    window.addEventListener("dp_config_updated", onDpConfig);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("dp_config_updated", onDpConfig);
    };
  }, [refreshIdentity]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!moreWrapRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toneRaw = identity?.tone?.trim();
  const toneLabel = toneRaw
    ? toneRaw.charAt(0).toUpperCase() + toneRaw.slice(1) + " tone"
    : null;
  const contextSnippet = identity?.context?.trim()
    ? identity.context.trim().slice(0, 55) +
      (identity.context.trim().length > 55 ? "…" : "")
    : null;

  const hasToneOrContext = Boolean(toneLabel || contextSnippet);

  const identityLeft = toneLabel
    ? toneLabel
    : contextSnippet
      ? "Context active"
      : null;
  const identityRight = contextSnippet
    ? contextSnippet
    : toneLabel
      ? "Add global context in Command Center"
      : null;

  const moreActive = moreNav.some(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Zap className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-semibold leading-tight tracking-tight">
                Synapse Suite
              </span>
              <span className="text-xs text-muted-foreground">
                Multi-Channel Outreach
              </span>
            </span>
          </Link>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/"
              title="Edit AI identity in Command Center"
              className={cn(
                "flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors lg:max-w-[min(100%,22rem)]",
                hasToneOrContext
                  ? "border-border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground"
                  : "border-dashed border-amber-500/40 bg-amber-500/5 text-amber-900/90 hover:bg-amber-500/10 dark:text-amber-200/90"
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              {hasToneOrContext ? (
                <>
                  <span className="shrink-0 font-medium text-foreground">
                    {identityLeft}
                  </span>
                  <span className="shrink-0 opacity-40">·</span>
                  <span className="min-w-0 truncate">{identityRight}</span>
                </>
              ) : (
                <span className="font-medium">Set AI identity in Command Center</span>
              )}
            </Link>

            <nav className="flex flex-wrap items-center gap-2">
              {primaryNav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {Icon ? <Icon className="size-4 shrink-0 opacity-90" /> : null}
                    {item.label}
                  </Link>
                );
              })}

              <div className="relative" ref={moreWrapRef}>
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((o) => !o)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    moreOpen || moreActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  More
                  <ChevronDown
                    className={cn(
                      "size-4 opacity-80 transition-transform",
                      moreOpen && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-lg border border-border bg-popover py-1 shadow-md"
                  >
                    {moreNav.map((item) => {
                      const Icon = item.icon;
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          role="menuitem"
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-foreground hover:bg-muted"
                          )}
                        >
                          {Icon ? <Icon className="size-4 shrink-0 opacity-80" /> : null}
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {sessionStatus === "authenticated" && session?.user && (
                <div className="flex w-full shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3 sm:w-auto sm:border-0 sm:pt-0">
                  <span
                    className="max-w-[14rem] truncate text-xs text-muted-foreground sm:text-sm"
                    title={session.user.email ?? session.user.name ?? ""}
                  >
                    {session.user.name ?? session.user.email ?? "Signed in"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      void signOut({ callbackUrl: "/login" })
                    }
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    Sign out
                  </Button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      <WorkflowJourney />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
