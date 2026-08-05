import type { Metadata } from "next";
import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import { InvestmentPlannerWorkspace } from "@/features/wealth/components/investment-planner-workspace";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import {
  buildWealthToolBreadcrumbJsonLd,
  buildWealthToolMetadata,
} from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthToolMetadata("compound-growth");

export default async function InvestmentPlannerPage() {
  const locale = parseAppLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={buildWealthToolBreadcrumbJsonLd("compound-growth")} />
      <InvestmentPlannerWorkspace locale={locale} />
    </TerminalAppShell>
  );
}
