import type { BackendDailyPriceDto, BackendStockDto } from "@/lib/api/backend-api-types";
import {
  formatBdt,
  formatCompactNumber,
  formatNumber,
  formatPercent,
} from "@/lib/formatters/financial-formatters";
import { buildStockIntelligence } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export type StockWorkspaceModel = {
  intelligence: StockIntelligenceModel | null;
  header: {
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    category: string;
    latestPrice: string;
    changePercent: string;
    marketCap: string;
    signal: string;
    confidence: string;
  };
  technicalSummary: Array<{ label: string; value: string; helper: string }>;
  insights: Array<{ title: string; description: string; tone: "positive" | "negative" | "neutral" | "warning" }>;
  fundamentals: Array<{ label: string; value: string }>;
};

function buildInsights(intelligence: StockIntelligenceModel | null): StockWorkspaceModel["insights"] {
  if (!intelligence) {
    return [
      {
        title: "Awaiting price history",
        description: "This stock needs OHLCV rows before technical insight can be generated.",
        tone: "warning",
      },
    ];
  }

  const insights: StockWorkspaceModel["insights"] = [
    {
      title: `${intelligence.signal.signal} context`,
      description: intelligence.signal.reason,
      tone:
        intelligence.signal.signal === "BUY"
          ? "positive"
          : intelligence.signal.signal === "SELL"
            ? "negative"
            : "neutral",
    },
  ];

  if (intelligence.volatility !== null && intelligence.volatility > 3) {
    insights.push({
      title: "Elevated volatility detected",
      description: "Recent daily movement is wide; use smaller position sizing and stronger confirmation.",
      tone: "warning",
    });
  }

  if (intelligence.averageVolume !== null && intelligence.volume > intelligence.averageVolume * 1.5) {
    insights.push({
      title: "Volume accumulation visible",
      description: "Latest volume is materially above the recent average, so price movement deserves attention.",
      tone: "positive",
    });
  }

  if (intelligence.rsi !== null && intelligence.rsi < 35) {
    insights.push({
      title: "RSI recovery watch",
      description: "RSI is near an oversold zone; watch for stabilization before treating it as a rebound.",
      tone: "warning",
    });
  }

  return insights;
}

export function buildStockWorkspaceModel(stock: BackendStockDto | null, prices: BackendDailyPriceDto[]): StockWorkspaceModel {
  const intelligence = stock ? buildStockIntelligence(stock, prices) : null;

  return {
    intelligence,
    header: {
      symbol: stock?.symbol ?? "UNKNOWN",
      name: stock?.name ?? "Stock not found",
      exchange: stock?.exchange ?? "DSE",
      sector: stock?.sector ?? "Unclassified",
      category: stock?.category ?? "N/A",
      latestPrice: formatNumber(intelligence?.latestPrice),
      changePercent: formatPercent(intelligence?.priceChangePercent),
      marketCap: formatCompactNumber(stock?.market_cap),
      signal: intelligence?.signal.signal ?? "HOLD",
      confidence: intelligence ? `${intelligence.signal.confidence}%` : "N/A",
    },
    technicalSummary: [
      {
        label: "Trend",
        value: intelligence?.trend ?? "UNKNOWN",
        helper: "Derived from price versus moving-average context.",
      },
      {
        label: "RSI",
        value: formatNumber(intelligence?.rsi),
        helper: "14-session momentum estimate from available closes.",
      },
      {
        label: "Volatility",
        value: formatPercent(intelligence?.volatility),
        helper: "Recent standard deviation of daily percentage changes.",
      },
      {
        label: "Avg Volume",
        value: formatCompactNumber(intelligence?.averageVolume),
        helper: "20-session average volume.",
      },
      {
        label: "Support",
        value: formatNumber(intelligence?.support),
        helper: "Lowest low in recent 20 sessions.",
      },
      {
        label: "Resistance",
        value: formatNumber(intelligence?.resistance),
        helper: "Highest high in recent 20 sessions.",
      },
    ],
    insights: buildInsights(intelligence),
    fundamentals: [
      { label: "Market Cap", value: formatCompactNumber(stock?.market_cap) },
      { label: "Paid-up Capital", value: formatBdt(stock?.paid_up_capital) },
      { label: "Category", value: stock?.category ?? "N/A" },
      { label: "Listing Date", value: stock?.listing_date ?? "N/A" },
    ],
  };
}
