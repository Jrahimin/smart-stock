import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { DashboardQueryHydration } from "@/features/market-dashboard/components/dashboard-query-hydration";
import { MarketDashboardView } from "@/features/market-dashboard/market-dashboard-view";
import { loadDashboardCore } from "@/lib/api/dashboard-server";
import { buildDashboardDehydratedState } from "@/lib/market/build-dashboard-dehydrated-state";

export async function DashboardPageShell() {
  const coreResult = await loadDashboardCore();
  const initialCore = coreResult.status === "error" ? null : coreResult.data;
  const dehydratedState = buildDashboardDehydratedState(initialCore);

  return (
    <TerminalAppShell>
      <DashboardQueryHydration state={dehydratedState}>
        <MarketDashboardView initialCore={initialCore} />
      </DashboardQueryHydration>
    </TerminalAppShell>
  );
}
