import type { Metadata } from "next";
import { cookies } from "next/headers";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WealthWorkspaceView } from "@/features/wealth/wealth-workspace-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import { buildWealthHubBreadcrumbJsonLd, buildWealthHubMetadata } from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthHubMetadata();

export default async function WealthPage() {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={buildWealthHubBreadcrumbJsonLd()} />
      <WealthWorkspaceView locale={locale} />
    </TerminalAppShell>
  );
}
