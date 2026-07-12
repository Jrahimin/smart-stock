import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketPulseClient } from "@/features/market-pulse/market-pulse-client";
import { PulseQueryHydration } from "@/features/market-pulse/components/pulse-query-hydration";
import { loadMarketPulseCore } from "@/lib/api/pulse-server";
import { buildPulseDehydratedState } from "@/lib/market/build-pulse-dehydrated-state";

export async function MarketPulsePageShell() {
  const coreResult = await loadMarketPulseCore();
  const initialCore = coreResult.status === "error" ? null : coreResult.data;
  const dehydratedState = buildPulseDehydratedState(initialCore);

  return (
    <TerminalAppShell>
      <PulseQueryHydration state={dehydratedState}>
        <MarketPulseClient initialCore={initialCore} />
      </PulseQueryHydration>
    </TerminalAppShell>
  );
}
