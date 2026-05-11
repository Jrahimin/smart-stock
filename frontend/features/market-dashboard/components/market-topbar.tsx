"use client";

import { Search } from "lucide-react";
import Image from "next/image";

import { DataQualityBadge } from "@/components/ui/data-quality-badge";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { frontendConfig } from "@/lib/frontend-config";
import { useCommandStore } from "@/stores/use-command-store";

type MarketTopbarProps = {
  model: MarketDashboardModel;
};

export function MarketTopbar({ model }: MarketTopbarProps) {
  const openCommand = useCommandStore((state) => state.open);
  const moodTone = model.marketMood.toLowerCase().replace(/\s+/g, "-");

  return (
    <header className="market-topbar">
      <div className="market-tape">
        <Image
          alt="Stock Intelligence"
          className="market-topbar-logo"
          height={40}
          priority
          src="/stock-icon-wide.png"
          width={160}
        />
        <strong className="market-tape-index">{model.exchange}X</strong>
        <span className={`market-tape-pill market-tape-mood-${moodTone}`}>Mood: {model.marketMood}</span>
        <span className="market-tape-pill">
          Breadth: <b>{model.breadth.advancing}</b> advancing / <b>{model.breadth.declining}</b> declining /{" "}
          <b>{model.breadth.unchanged}</b> unchanged
        </span>
        <span className="market-tape-pill">As of: {model.latestTradeDate}</span>
        <span className="market-tape-pill" title={model.session.description}>Session: {model.session.label}</span>
        <span className="market-tape-pill">
          Cache: {frontendConfig.cacheHours}h / {model.session.shouldPoll ? "polling ready" : "manual refresh"}
        </span>
        {model.session.disablesFreshDataActions ? <span className="market-tape-pill market-tape-pill-warning">Refresh guarded</span> : null}
        <DataQualityBadge quality={model.dataQuality} />
      </div>
      <button className="command-trigger" onClick={openCommand} type="button">
        <Search size={16} aria-hidden="true" />
        <span>Search ticker or command</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>
  );
}
