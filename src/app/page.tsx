import { AppShell } from "@/components/app-shell";
import { CommandCenterClient } from "@/components/command-center-client";

export default function Home() {
  return (
    <AppShell>
      <CommandCenterClient />
    </AppShell>
  );
}
