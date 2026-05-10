"use client";

import { Search } from "lucide-react";

import { DataQualityBadge } from "@/components/ui/data-quality-badge";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";
import { useCommandStore } from "@/stores/use-command-store";

type MarketTopbarProps = {
  model: MarketDashboardModel;
};

export function MarketTopbar({ model }: MarketTopbarProps) {
  const openCommand = useCommandStore((state) => state.open);

  return (
    <header className="market-topbar">
      <div className="market-tape">
        <strong>{model.exchange}X</strong>
        <span>Mood: {model.marketMood}</span>
        <span>Breadth: {model.breadth.advancing}/{model.breadth.declining}/{model.breadth.unchanged}</span>
        <span>Session: {model.session.label}</span>
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
