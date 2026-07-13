import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { SignalCenterView } from "@/features/signals/signal-center-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function SignalsPageShell() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <SignalCenterView locale={locale} />
    </TerminalAppShell>
  );
}
