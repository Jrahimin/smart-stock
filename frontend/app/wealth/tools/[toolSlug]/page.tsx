import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import { DpsSimulatorWorkspace } from "@/features/wealth/components/dps-simulator-workspace";
import { FdrToolWorkspace } from "@/features/wealth/components/fdr-tool-workspace";
import { SanchayapatraToolWorkspace } from "@/features/wealth/components/sanchayapatra-tool-workspace";
import { TaxPlannerWorkspace } from "@/features/wealth/components/tax-planner-workspace";
import { WealthFutureJourneyWorkspace } from "@/features/wealth/components/wealth-future-journey-workspace";
import { WealthToolWorkspace } from "@/features/wealth/components/wealth-tool-workspace";
import type { WealthToolSlug } from "@/features/wealth/types/wealth-types";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import {
  buildWealthToolBreadcrumbJsonLd,
  buildWealthToolMetadata,
} from "@/lib/seo/wealth-page-seo";

type WealthToolPageProps = {
  params: Promise<{ toolSlug: string }>;
};

function isWealthToolSlug(toolSlug: string): toolSlug is WealthToolSlug {
  return toolSlug in WEALTH_TOOL_CONFIG;
}

export async function generateMetadata({ params }: WealthToolPageProps): Promise<Metadata> {
  const { toolSlug } = await params;
  if (!isWealthToolSlug(toolSlug)) {
    return {
      title: "Wealth Calculator",
      description: "Explore money scenarios in Wealth Workspace.",
    };
  }

  return buildWealthToolMetadata(toolSlug);
}

export default async function WealthToolPage({ params }: WealthToolPageProps) {
  const { toolSlug } = await params;
  if (!isWealthToolSlug(toolSlug)) {
    notFound();
  }
  const locale = parseAppLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);

  const workspace =
    toolSlug === "dps" ? (
      <DpsSimulatorWorkspace locale={locale} />
    ) : toolSlug === "tax-planner" ? (
      <TaxPlannerWorkspace locale={locale} />
    ) : toolSlug === "fdr" ? (
      <FdrToolWorkspace locale={locale} />
    ) : toolSlug === "sanchayapatra" ? (
      <SanchayapatraToolWorkspace locale={locale} />
    ) : toolSlug === "compound-growth" || toolSlug === "savings-goal" ? (
      <WealthFutureJourneyWorkspace toolSlug={toolSlug} />
    ) : (
      <WealthToolWorkspace locale={locale} toolSlug={toolSlug} />
    );

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={buildWealthToolBreadcrumbJsonLd(toolSlug)} />
      {workspace}
    </TerminalAppShell>
  );
}
