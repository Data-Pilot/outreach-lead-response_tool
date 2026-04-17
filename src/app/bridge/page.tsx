import { AppShell } from "@/components/app-shell";
import { ExternalLink, Puzzle } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function BridgePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Puzzle className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">Chrome Extension</h1>
        <p className="mt-3 text-muted-foreground">
          The extension runs in your browser on LinkedIn — it detects profiles you have
          already emailed and suggests personalised follow-ups using your Strategic Identity.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href="https://chrome.google.com/webstore"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default" }), "gap-2 w-full max-w-xs")}
          >
            <ExternalLink className="size-4" />
            Install Chrome Extension
          </a>
          <Link
            href="/extension-auth"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2 w-full max-w-xs")}
          >
            Connect extension to account
          </Link>
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-6 text-left text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              {
                "Install the Chrome extension and click \"Connect extension to account\""
              }
            </li>
            <li>Open any LinkedIn profile in your browser</li>
            <li>Extension checks if you have already emailed that person</li>
            <li>If matched: shows when email was sent + suggests follow-up DM</li>
            <li>If new: suggests a cold connection message based on your identity</li>
          </ol>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Your Strategic Identity and Tone from the{" "}
          <Link href="/" className="text-primary underline-offset-2 hover:underline">
            Command Center
          </Link>{" "}
          are used to personalise every suggestion.
        </p>
      </div>
    </AppShell>
  );
}
