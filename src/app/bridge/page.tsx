import { AppShell } from "@/components/app-shell";
import { Puzzle } from "lucide-react";

export default function BridgePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Puzzle className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold">The Bridge</h1>
        <p className="mt-3 text-muted-foreground">
          The Bridge runs as a <strong className="text-foreground">Chrome Extension</strong> — it
          reads the LinkedIn profile you are viewing, checks{" "}
          <code className="rounded bg-muted px-1 text-xs">dp_sent_log</code> to
          detect if you have already emailed that person, and suggests a
          personalised DM, InMail, or connection note based on your AI identity.
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-6 text-left text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Install the Chrome extension (coming soon)</li>
            <li>Open any LinkedIn profile in your browser</li>
            <li>The extension cross-references the URL against dp_sent_log</li>
            <li>If matched: Bridge Mode (shows when email was sent + suggests follow-up)</li>
            <li>If new: Intro Mode (suggests cold connection message)</li>
          </ol>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Make sure your Global Context and Tone are set in the Command Center — the extension reads these from dp_config.
        </p>
      </div>
    </AppShell>
  );
}
