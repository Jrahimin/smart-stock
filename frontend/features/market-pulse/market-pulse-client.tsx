"use client";

import { PulseSsrHydrationGuard } from "@/features/market-pulse/components/pulse-ssr-hydration-guard";
import { useMarketPulse } from "@/features/market-pulse/hooks/use-market-pulse";
import { MarketPulseView } from "@/features/market-pulse/market-pulse-view";
import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";

type MarketPulseClientProps = {
  initialCore: MarketPulseCorePayload | null;
};

export function MarketPulseClient({ initialCore }: MarketPulseClientProps) {
  const pulse = useMarketPulse({ initialCore });

  return (
    <>
      {initialCore ? <PulseSsrHydrationGuard initialCore={initialCore} /> : null}
      <MarketPulseView {...pulse} />
    </>
  );
}
