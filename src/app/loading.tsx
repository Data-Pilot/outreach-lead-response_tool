import { AppShell } from "@/components/app-shell";
import { PageLoadingSkeleton } from "@/components/ui/page-state";

export default function Loading() {
  return (
    <AppShell>
      <PageLoadingSkeleton variant="generic" className="py-2" />
    </AppShell>
  );
}
