import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WEALTH_COMPARISON_DEFAULTS } from "@/features/wealth/catalog/wealth-catalog";
import { WealthComparisonWorkspace } from "@/features/wealth/components/wealth-comparison-workspace";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import {
  buildWealthComparisonBreadcrumbJsonLd,
  buildWealthComparisonMetadata,
} from "@/lib/seo/wealth-page-seo";

type WealthComparisonPageProps = {
  params: Promise<{ comparisonSlug: string }>;
};

function isWealthComparisonSlug(comparisonSlug: string): comparisonSlug is WealthComparisonSlug {
  return comparisonSlug in WEALTH_COMPARISON_DEFAULTS;
}

export async function generateMetadata({ params }: WealthComparisonPageProps): Promise<Metadata> {
  const { comparisonSlug } = await params;
  if (!isWealthComparisonSlug(comparisonSlug)) {
    return {
      title: "Wealth Comparison",
      description: "Compare two money paths side by side in Wealth Workspace.",
    };
  }

  return buildWealthComparisonMetadata(comparisonSlug);
}

export default async function WealthComparisonPage({ params }: WealthComparisonPageProps) {
  const { comparisonSlug } = await params;
  if (!isWealthComparisonSlug(comparisonSlug)) {
    notFound();
  }
  const locale = parseAppLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={buildWealthComparisonBreadcrumbJsonLd(comparisonSlug)} />
      <WealthComparisonWorkspace comparisonSlug={comparisonSlug} locale={locale} />
    </TerminalAppShell>
  );
}
