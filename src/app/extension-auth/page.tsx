"use client";

/**
 * /extension-auth
 *
 * Dedicated page for the Chrome extension login flow.
 *
 * States:
 *   loading   — checking session
 *   unauthenticated — shows "Sign in with LinkedIn" button
 *   generating — fetching extension token from API
 *   success   — token written to localStorage, extension can pick it up
 *   error     — something went wrong, shows retry
 *
 * The extension opens this URL in a new tab. A content script running on the
 * web app domain reads localStorage("dp_extension_token") and stores it in
 * chrome.storage.local, then closes the tab automatically.
 */

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { CheckCircle2, Loader2, Puzzle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type State =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "generating" }
  | { status: "success"; name: string; expires_at: string }
  | { status: "error"; message: string };

export default function ExtensionAuthPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (sessionStatus === "unauthenticated") {
      setState({ status: "unauthenticated" });
      return;
    }

    // Authenticated — generate the extension token
    setState({ status: "generating" });

    void (async () => {
      try {
        const res = await fetch("/api/auth/extension-token", { method: "POST" });
        const data = (await res.json()) as {
          token?: string;
          expires_at?: string;
          error?: string;
        };

        if (!res.ok || !data.token) {
          setState({
            status: "error",
            message: data.error ?? "Failed to generate extension token.",
          });
          return;
        }

        // Write to localStorage — extension content script picks this up
        try {
          localStorage.setItem("dp_extension_token", data.token);
          localStorage.setItem("dp_extension_token_exp", data.expires_at ?? "");
          // Fire a custom event so any listening content script reacts immediately
          window.dispatchEvent(new CustomEvent("dp_extension_token_ready"));
        } catch {
          // localStorage blocked (unlikely on own domain, but handle gracefully)
        }

        setState({
          status: "success",
          name: session?.user?.name ?? "You",
          expires_at: data.expires_at ?? "",
        });
      } catch (e) {
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Unexpected error.",
        });
      }
    })();
  }, [sessionStatus, session]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* Logo mark */}
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Puzzle className="size-7" />
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            LynkWell AI Extension
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your browser extension to your account
          </p>
        </div>

        {/* ── States ── */}

        {state.status === "loading" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking your session…
          </div>
        )}

        {state.status === "unauthenticated" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sign in with LinkedIn to connect the extension to your LinkWell AI account.
            </p>
            <Button
              className="w-full gap-2 rounded-full"
              onClick={() =>
                void signIn("linkedin", { callbackUrl: "/extension-auth" })
              }
            >
              Sign in with LinkedIn
            </Button>
          </div>
        )}

        {state.status === "generating" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Connecting extension…
          </div>
        )}

        {state.status === "success" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="text-sm font-medium">
                Connected as <span className="text-foreground">{state.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Token valid until{" "}
                {state.expires_at
                  ? new Date(state.expires_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "90 days from now"}
              </p>
            </div>

            <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1 text-left">
              <p className="font-medium text-foreground">What happens next</p>
              <p>The extension will detect the connection automatically.</p>
              <p>You can close this tab.</p>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <XCircle className="size-10 text-destructive" />
              <p className="text-sm text-destructive">{state.message}</p>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setState({ status: "loading" })}
            >
              Try again
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
