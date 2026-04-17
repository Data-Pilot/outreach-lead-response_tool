"use client";

import { Suspense, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** After sign-in, always land on Command Center. */
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
        <div className="flex flex-col items-center">
          <Image
            src="/linkwell-ai-logo.png"
            alt=""
            width={64}
            height={64}
            className="size-16 object-contain"
            priority
            role="presentation"
          />
          <h1 className="mt-3 text-center text-xl font-semibold tracking-tight text-foreground">
            LynkWell AI
          </h1>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Sign in to continue.
        </p>
        {oauthError && (
          <div className="mt-4 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <p className="font-medium text-foreground">
              {isCallbackError
                ? "Sign-in did not complete"
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
        <div className="mt-8 flex flex-col gap-3">
          <Button
            type="button"
            className="w-full gap-2 rounded-full"
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
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 rounded-full"
            size="lg"
            onClick={() => void signIn("google", { callbackUrl: AFTER_SIGN_IN })}
          >
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </div>
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
