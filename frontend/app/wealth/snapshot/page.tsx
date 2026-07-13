import type { Metadata } from "next";
import { cookies } from "next/headers";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MoneySnapshotDashboardView } from "@/features/wealth/money-snapshot-dashboard-view";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import {
  buildWealthSnapshotBreadcrumbJsonLd,
  buildWealthSnapshotMetadata,
} from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthSnapshotMetadata();

export default async function WealthSnapshotPage() {
  const locale = parseAppLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={buildWealthSnapshotBreadcrumbJsonLd()} />
      <MoneySnapshotDashboardView locale={locale} />
    </TerminalAppShell>
  );
}
