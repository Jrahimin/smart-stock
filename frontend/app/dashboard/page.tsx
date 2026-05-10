import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketDashboardView } from "@/features/market-dashboard/market-dashboard-view";

export default function DashboardPage() {
  return (
    <TerminalAppShell>
      <MarketDashboardView />
    </TerminalAppShell>
  );
}

