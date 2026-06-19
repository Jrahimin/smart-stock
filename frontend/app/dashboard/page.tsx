import type { Metadata } from "next";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketDashboardView } from "@/features/market-dashboard/market-dashboard-view";
import { buildDashboardMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildDashboardMetadata();

export default function DashboardPage() {
  return (
    <TerminalAppShell>
      <MarketDashboardView />
    </TerminalAppShell>
  );
}

