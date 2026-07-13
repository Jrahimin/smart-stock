import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function ScannerPageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <ScannerWorkspaceView locale={locale} />
    </TerminalAppShell>
  );
}
