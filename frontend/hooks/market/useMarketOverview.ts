import type {
  MarketOverview,
  TradingSignalSummary,
  WatchlistStock,
} from "@/lib/api/backend-api-types";

const marketOverview: MarketOverview = {
  totalStocks: 392,
  advancingStocks: 126,
  decliningStocks: 98,
  neutralStocks: 168,
};

const watchlistStocks: WatchlistStock[] = [
  {
    symbol: "GP",
    name: "Grameenphone Ltd.",
    exchange: "DSE",
    price: "286.40",
    changePercent: "+1.24%",
    signal: "HOLD",
  },
  {
    symbol: "SQURPHARMA",
    name: "Square Pharmaceuticals PLC",
    exchange: "DSE",
    price: "212.10",
    changePercent: "+0.82%",
    signal: "BUY",
  },
  {
    symbol: "BRACBANK",
    name: "BRAC Bank PLC",
    exchange: "DSE",
    price: "44.70",
    changePercent: "-0.45%",
    signal: "HOLD",
  },
];

const highlightedSignals: TradingSignalSummary[] = [
  {
    symbol: "SQURPHARMA",
    signal: "BUY",
    confidence: "72%",
    reason: "Momentum and trend scores are aligned.",
  },
  {
    symbol: "GP",
    signal: "HOLD",
    confidence: "58%",
    reason: "Trend remains stable but momentum is not decisive.",
  },
];

export function useMarketOverview() {
  return {
    marketOverview,
    watchlistStocks,
    highlightedSignals,
  };
}

