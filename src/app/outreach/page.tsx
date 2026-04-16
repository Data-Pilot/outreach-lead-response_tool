import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";

import { OutreachEngineClient } from "./outreach-client";

export default function OutreachPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading outreach…</div>
        }
      >
        <OutreachEngineClient />
      </Suspense>
    </AppShell>
  );
}
