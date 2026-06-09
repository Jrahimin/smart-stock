import { notFound } from "next/navigation";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WEALTH_TOOL_CONFIG } from "@/features/wealth/catalog/wealth-catalog";
import { DpsSimulatorWorkspace } from "@/features/wealth/components/dps-simulator-workspace";
import { FdrToolWorkspace } from "@/features/wealth/components/fdr-tool-workspace";
import { SanchayapatraToolWorkspace } from "@/features/wealth/components/sanchayapatra-tool-workspace";
import { TaxPlannerWorkspace } from "@/features/wealth/components/tax-planner-workspace";
import { WealthFutureJourneyWorkspace } from "@/features/wealth/components/wealth-future-journey-workspace";
import { WealthToolWorkspace } from "@/features/wealth/components/wealth-tool-workspace";
import type { WealthToolSlug } from "@/features/wealth/types/wealth-types";

type WealthToolPageProps = {
  params: Promise<{ toolSlug: string }>;
};

export default async function WealthToolPage({ params }: WealthToolPageProps) {
  const { toolSlug } = await params;
  if (!(toolSlug in WEALTH_TOOL_CONFIG)) {
    notFound();
  }

  const workspace =
    toolSlug === "dps" ? (
      <DpsSimulatorWorkspace />
    ) : toolSlug === "tax-planner" ? (
      <TaxPlannerWorkspace />
    ) : toolSlug === "fdr" ? (
      <FdrToolWorkspace />
    ) : toolSlug === "sanchayapatra" ? (
      <SanchayapatraToolWorkspace />
    ) : toolSlug === "compound-growth" || toolSlug === "savings-goal" ? (
      <WealthFutureJourneyWorkspace toolSlug={toolSlug} />
    ) : (
      <WealthToolWorkspace toolSlug={toolSlug as WealthToolSlug} />
    );

  return <TerminalAppShell>{workspace}</TerminalAppShell>;
}
