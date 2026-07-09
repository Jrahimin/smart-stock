import type { BackendDailyPriceDto, BackendStockDto } from "@/lib/api/backend-api-types";
import type { StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { buildStockIntelligence } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { resolveDisplayedMarketCap } from "@/features/stock-workspace/view-models/market-cap-view-model";

export type StockWorkspaceModel = {
  intelligence: StockIntelligenceModel | null;
  header: {
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    category: string;
    listingDate: string | null;
    latestPrice: string;
    changePercent: string;
    marketCap: string;
    signal: string;
    confidence: string;
  };
  technicalSummary: Array<{ label: string; value: string; helper: string }>;
  insights: Array<{
    title: string;
    description: string;
    tone: "positive" | "negative" | "neutral" | "warning";
    category: "warning" | "opportunity" | "momentum" | "accumulation" | "volatility" | "risk";
  }>;
};

type BuildStockWorkspaceModelOptions = {
  decisionSupport?: StockDecisionSupportDto | null;
};

function buildInsights(intelligence: StockIntelligenceModel | null): StockWorkspaceModel["insights"] {
  if (!intelligence) {
    return [
      {
        title: "Awaiting price history",
        description: "This stock needs OHLCV rows before technical insight can be generated.",
        tone: "warning",
        category: "warning",
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
      category:
        intelligence.signal.signal === "BUY" ? "opportunity" : intelligence.signal.signal === "SELL" ? "risk" : "momentum",
    },
  ];

  if (intelligence.volatility !== null && intelligence.volatility > 3) {
    insights.push({
      title: "Elevated volatility detected",
      description: "Recent daily movement is wide; use smaller position sizing and stronger confirmation.",
      tone: "warning",
      category: "volatility",
    });
  }

  if (intelligence.averageVolume !== null && intelligence.volume > intelligence.averageVolume * 1.5) {
    insights.push({
      title: "Volume accumulation visible",
      description: "Latest volume is materially above the recent average, so price movement deserves attention.",
      tone: "positive",
      category: "accumulation",
    });
  }

  if (intelligence.rsi !== null && intelligence.rsi < 35) {
    insights.push({
      title: "RSI recovery watch",
      description: "RSI is near an oversold zone; watch for stabilization before treating it as a rebound.",
      tone: "warning",
      category: "momentum",
    });
  }

  return insights;
}

export function buildEmptyStockWorkspaceModel(options: {
  symbol: string;
  exchange: string;
  name: string;
}): StockWorkspaceModel {
  return {
    intelligence: null,
    header: {
      symbol: options.symbol,
      name: options.name,
      exchange: options.exchange,
      sector: "—",
      category: "—",
      listingDate: null,
      latestPrice: "—",
      changePercent: "—",
      marketCap: "—",
      signal: "—",
      confidence: "—",
    },
    technicalSummary: [],
    insights: [],
  };
}

export function buildStockWorkspaceModel(
  stock: BackendStockDto | null,
  prices: BackendDailyPriceDto[],
  options: BuildStockWorkspaceModelOptions = {},
): StockWorkspaceModel {
  const intelligence = stock ? buildStockIntelligence(stock, prices) : null;
  const decisionSupport = options.decisionSupport;
  const support = decisionSupport?.support ?? intelligence?.support ?? null;
  const resistance = decisionSupport?.resistance ?? intelligence?.resistance ?? null;

  return {
    intelligence,
    header: {
      symbol: stock?.symbol ?? "UNKNOWN",
      name: stock?.name ?? "Stock not found",
      exchange: stock?.exchange ?? "DSE",
      sector: stock?.sector ?? "Unclassified",
      category: stock?.category ?? "N/A",
      listingDate: stock?.listing_date ?? null,
      latestPrice: formatNumber(intelligence?.latestPrice),
      changePercent: formatPercent(intelligence?.priceChangePercent),
      marketCap: resolveDisplayedMarketCap(stock, intelligence, decisionSupport),
      signal: intelligence?.signal.signal ?? "HOLD",
      confidence: intelligence ? `${intelligence.signal.confidence}%` : "N/A",
    },
    technicalSummary: [
      {
        label: "Trend",
        value: decisionSupport?.trend ?? intelligence?.trend ?? "UNKNOWN",
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
        value: formatNumber(support),
        helper: "Canonical support from the decision engine when available.",
      },
      {
        label: "Resistance",
        value: formatNumber(resistance),
        helper: "Canonical resistance from the decision engine when available.",
      },
    ],
    insights: buildInsights(intelligence),
  };
}
