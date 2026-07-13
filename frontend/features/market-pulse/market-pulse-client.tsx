"use client";

import { PulseSsrHydrationGuard } from "@/features/market-pulse/components/pulse-ssr-hydration-guard";
import { useMarketPulse } from "@/features/market-pulse/hooks/use-market-pulse";
import { MarketPulseView } from "@/features/market-pulse/market-pulse-view";
import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type MarketPulseClientProps = {
  initialCore: MarketPulseCorePayload | null;
  locale?: AppLocale;
};

export function MarketPulseClient({ initialCore, locale = DEFAULT_LOCALE }: MarketPulseClientProps) {
  const pulse = useMarketPulse({ initialCore, locale });

  return (
    <>
      {initialCore ? <PulseSsrHydrationGuard initialCore={initialCore} /> : null}
      <MarketPulseView {...pulse} locale={locale} />
    </>
  );
}
