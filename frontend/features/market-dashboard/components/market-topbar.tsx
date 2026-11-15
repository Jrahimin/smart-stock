"use client";

import Image from "next/image";

import { DataQualityBadge } from "@/components/ui/data-quality-badge";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTopbarProps = {
  model: MarketDashboardModel;
};

export function MarketTopbar({ model }: MarketTopbarProps) {
  const moodTone = model.marketMood.toLowerCase().replace(/\s+/g, "-");

  return (
    <header className="market-topbar">
      <div className="market-tape">
        <Image
          alt="StockWealth BD"
          className="market-topbar-logo"
          height={30}
          priority
          src="/dashboard/stockwealth-lockup.webp"
          width={160}
        />
        <strong className="market-tape-index">{model.exchange}X</strong>
        <span className={`market-tape-pill market-tape-mood-${moodTone}`}>Mood: {model.marketMood}</span>
        <span className="market-tape-pill">
          Breadth: <b>{model.breadth.advancing}</b> advancing / <b>{model.breadth.declining}</b> declining /{" "}
          <b>{model.breadth.unchanged}</b> unchanged
        </span>
        <span className="market-tape-pill">As of: {model.latestTradeDate}</span>
        <DataQualityBadge quality={model.dataQuality} />
      </div>
    </header>
  );
}
