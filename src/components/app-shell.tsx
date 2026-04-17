"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Filter,
  LayoutDashboard,
  LogOut,
  Mails,
  Puzzle,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkflowJourney } from "@/components/workflow-journey";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const mainNav: NavItem[] = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/campaigns", label: "Outreach Engine", icon: Mails },
  { href: "/bridge", label: "Extension", icon: Puzzle },
  { href: "/funnel", label: "Funnel", icon: Filter },
];

function navItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navPillBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const tokenFetchedRef = useRef(false);

  // Auto-generate extension token and write to localStorage so the Chrome
  // extension content script can pick it up on the web app domain.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || tokenFetchedRef.current) return;

    // Skip if a valid token already exists (check expiry stored alongside it)
    try {
      const exp = localStorage.getItem("dp_extension_token_exp");
      if (exp) {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (new Date(exp).getTime() - Date.now() > sevenDays) return;
      }
    } catch { /* ignore */ }

    tokenFetchedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/extension-token", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { token?: string; expires_at?: string };
        if (!data.token) return;
        localStorage.setItem("dp_extension_token", data.token);
        localStorage.setItem("dp_extension_token_exp", data.expires_at ?? "");
      } catch { /* non-fatal */ }
    })();
  }, [sessionStatus]);

  // Command Center owns dp_config hydration; clear bridge cache on sign-out only.
  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;
    try {
      localStorage.removeItem("dp_config");
    } catch { /* ignore */ }
  }, [sessionStatus]);

  const displayName =
    session?.user?.name ?? session?.user?.email ?? "Signed in";
  const displaySub =
    session?.user?.name && session?.user?.email
      ? session.user.email
      : "Account";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-w-0 max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-5 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
            aria-label="LynkWell AI — home"
          >
            <Image
              src="/linkwell-ai-logo.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 object-contain"
              priority
              role="presentation"
            />
            <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
              <span className="truncate text-[15px] tracking-tight">
                <span className="font-semibold text-foreground">LynkWell</span>
                <span className="font-normal text-foreground"> AI</span>
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                Multi-channel outreach suite
              </span>
            </span>
          </Link>

          <div
            className="hidden h-9 w-px shrink-0 bg-border sm:block"
            aria-hidden
          />

          <nav
            className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden"
            aria-label="Main"
          >
            {mainNav.map((item) => {
              const active = navItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    navPillBase,
                    active
                      ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                      : "font-normal text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {sessionStatus === "authenticated" && session?.user && (
            <>
              <div
                className="hidden h-9 w-px shrink-0 bg-border sm:block"
                aria-hidden
              />
              <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
                <div className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
                  <span
                    className="max-w-[11rem] truncate text-sm font-semibold text-foreground"
                    title={displayName}
                  >
                    {displayName}
                  </span>
                  <span
                    className="max-w-[11rem] truncate text-xs text-muted-foreground"
                    title={displaySub}
                  >
                    {displaySub}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col leading-tight sm:hidden">
                  <span className="max-w-[7rem] truncate text-xs font-semibold text-foreground">
                    {displayName}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={() => void signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="size-4" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </div>
      </header>

      <WorkflowJourney />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
