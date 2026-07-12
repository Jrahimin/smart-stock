import type { Metadata } from "next";

import { MarketPulsePageShell } from "@/features/market-pulse/market-pulse-page-shell";
import { buildMarketPulseMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildMarketPulseMetadata();

export default function MarketPulsePage() {
  return <MarketPulsePageShell />;
}
