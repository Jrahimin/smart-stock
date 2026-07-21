import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ProtectedRoute } from "@/features/auth/components/protected-route";
import { PortfolioWorkspaceView } from "@/features/portfolio/portfolio-workspace-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function PortfolioPageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  return <TerminalAppShell dashboardLocale={locale}><ProtectedRoute><PortfolioWorkspaceView locale={locale} /></ProtectedRoute></TerminalAppShell>;
}
