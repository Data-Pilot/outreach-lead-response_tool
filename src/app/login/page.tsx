"use client";

import { Suspense, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** After LinkedIn sign-in, always land on Command Center. */
const AFTER_SIGN_IN = "/";

function LoginInner() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  const isCallbackError = oauthError === "Callback";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(AFTER_SIGN_IN);
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Synapse Suite
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sign in with your LinkedIn account to continue.
        </p>
        {oauthError && (
          <div className="mt-4 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <p className="font-medium text-foreground">
              {isCallbackError
                ? "LinkedIn sign-in did not complete"
                : `Sign-in failed (${oauthError})`}
            </p>
            {isCallbackError && (
              <p className="text-xs leading-relaxed text-destructive/95">
                NextAuth reports provider failures as{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                  error=Callback
                </code>{" "}
                in the address bar. The server log usually has the real reason (for
                example{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                  invalid_scope_error
                </code>
                ).
              </p>
            )}
            {oauthErrorDescription && (
              <p className="text-xs text-destructive/90">{oauthErrorDescription}</p>
            )}
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-destructive/95">
              <li>
                In{" "}
                <a
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  href="https://www.linkedin.com/developers/apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn Developers
                </a>
                , open your app → <strong className="text-foreground">Products</strong> →
                enable{" "}
                <strong className="text-foreground">
                  Sign In with LinkedIn using OpenID Connect
                </strong>
                . Without this product, OIDC scopes are rejected.
              </li>
              <li>
                Confirm <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">LINKEDIN_CLIENT_ID</code>{" "}
                and secret are from <em>that same</em> app.
              </li>
              <li>
                Scopes are controlled by{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                  LINKEDIN_SCOPE
                </code>{" "}
                (default in code is minimal: <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">openid</code>
                ). After OIDC is enabled, you can try{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                  openid profile
                </code>{" "}
                or{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                  openid profile email
                </code>{" "}
                in <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">.env</code>, restart{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">npm run dev</code>.
              </li>
            </ul>
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => router.replace("/login")}
            >
              Dismiss message
            </button>
          </div>
        )}
        <Button
          type="button"
          className="mt-8 w-full gap-2"
          size="lg"
          onClick={() => void signIn("linkedin", { callbackUrl: AFTER_SIGN_IN })}
        >
          <svg
            className="size-5 shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          Continue with LinkedIn
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-muted-foreground">
            <Loader2 className="size-8 animate-spin" aria-hidden />
          </div>
        }
      >
        <LoginInner />
      </Suspense>
    </div>
  );
}
