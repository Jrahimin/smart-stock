import type { Metadata } from "next";
import { Suspense } from "react";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";
import { buildStocksMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildStocksMetadata();

export default function StocksPage() {
  return (
    <TerminalAppShell>
      <Suspense fallback={null}>
        <StockExplorerView />
      </Suspense>
    </TerminalAppShell>
  );
}
