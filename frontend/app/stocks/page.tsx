import type { Metadata } from "next";

import { StockExplorerPageShell } from "@/features/stock-workspace/stock-explorer-page-shell";
import { buildStocksMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildStocksMetadata();

export default function StocksPage() {
  return <StockExplorerPageShell />;
}
