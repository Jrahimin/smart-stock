import { notFound } from "next/navigation";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WEALTH_COMPARISON_DEFAULTS } from "@/features/wealth/catalog/wealth-catalog";
import { WealthComparisonWorkspace } from "@/features/wealth/components/wealth-comparison-workspace";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";

type WealthComparisonPageProps = {
  params: Promise<{ comparisonSlug: string }>;
};

export default async function WealthComparisonPage({ params }: WealthComparisonPageProps) {
  const { comparisonSlug } = await params;
  if (!(comparisonSlug in WEALTH_COMPARISON_DEFAULTS)) {
    notFound();
  }

  return (
    <TerminalAppShell>
      <WealthComparisonWorkspace comparisonSlug={comparisonSlug as WealthComparisonSlug} />
    </TerminalAppShell>
  );
}
