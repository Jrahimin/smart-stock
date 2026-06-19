import type { Metadata } from "next";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketPulseView } from "@/features/market-pulse/market-pulse-view";
import { buildMarketPulseMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildMarketPulseMetadata();

export default function MarketPulsePage() {
  return (
    <TerminalAppShell>
      <MarketPulseView />
    </TerminalAppShell>
  );
}
