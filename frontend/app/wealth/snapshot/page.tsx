import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MoneySnapshotDashboardView } from "@/features/wealth/money-snapshot-dashboard-view";

export default function WealthSnapshotPage() {
  return (
    <TerminalAppShell>
      <MoneySnapshotDashboardView />
    </TerminalAppShell>
  );
}
