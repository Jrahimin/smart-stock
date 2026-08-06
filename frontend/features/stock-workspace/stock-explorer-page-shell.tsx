import { cookies } from "next/headers";
import { Suspense } from "react";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function StockExplorerPageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <Suspense fallback={null}>
        <StockExplorerView locale={locale} />
      </Suspense>
    </TerminalAppShell>
  );
}
