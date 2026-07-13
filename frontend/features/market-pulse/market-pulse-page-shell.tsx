import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketPulseClient } from "@/features/market-pulse/market-pulse-client";
import { PulseQueryHydration } from "@/features/market-pulse/components/pulse-query-hydration";
import { loadMarketPulseCore } from "@/lib/api/pulse-server";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import { buildPulseDehydratedState } from "@/lib/market/build-pulse-dehydrated-state";

export async function MarketPulsePageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const coreResult = await loadMarketPulseCore();
  const initialCore = coreResult.status === "error" ? null : coreResult.data;
  const dehydratedState = buildPulseDehydratedState(initialCore);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <PulseQueryHydration state={dehydratedState}>
        <MarketPulseClient initialCore={initialCore} locale={locale} />
      </PulseQueryHydration>
    </TerminalAppShell>
  );
}
