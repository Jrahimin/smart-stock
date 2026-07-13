import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { DashboardQueryHydration } from "@/features/market-dashboard/components/dashboard-query-hydration";
import { MarketDashboardView } from "@/features/market-dashboard/market-dashboard-view";
import { loadDashboardCore } from "@/lib/api/dashboard-server";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import { buildDashboardDehydratedState } from "@/lib/market/build-dashboard-dehydrated-state";

export async function DashboardPageShell() {
  const coreResult = await loadDashboardCore();
  const initialCore = coreResult.status === "error" ? null : coreResult.data;
  const dehydratedState = buildDashboardDehydratedState(initialCore);
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <DashboardQueryHydration state={dehydratedState}>
        <MarketDashboardView initialCore={initialCore} locale={locale} />
      </DashboardQueryHydration>
    </TerminalAppShell>
  );
}
