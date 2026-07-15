import type { BackendDailyPriceDto, BackendStockDto } from "@/lib/api/backend-api-types";
import type { DisplayMetricsDto, StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { buildChartStockIntelligence } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { normalizeTrendDirection } from "@/lib/market/trend-display";
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
    /** Display-only chart/context signal from OHLCV helpers — not the page action. */
    chartContextSignal: string;
    chartContextConfidence: string;
  };
  technicalSummary: Array<{ key: string; label: string; value: string; helper: string }>;
  insights: Array<{
    title: string;
    description: string;
    tone: "positive" | "negative" | "neutral" | "warning";
    category: "warning" | "opportunity" | "momentum" | "accumulation" | "volatility" | "risk";
  }>;
};

type BuildStockWorkspaceModelOptions = {
  decisionSupport?: StockDecisionSupportDto | null;
  displayMetrics?: DisplayMetricsDto | null;
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

  const insights: StockWorkspaceModel["insights"] = [];

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

function applyCanonicalDecisionSupport(
  chartIntelligence: StockIntelligenceModel | null,
  decisionSupport: StockDecisionSupportDto | null | undefined,
): StockIntelligenceModel | null {
  if (!chartIntelligence || !decisionSupport?.decision) {
    return chartIntelligence;
  }

  const snapshot = decisionSupport.technical_snapshot;
  const decision = decisionSupport.decision;
  const displayAction =
    decision.display_action ??
    (decision.recommendation === "SELL" ? "SELL" : "WAIT");
  const compatibilitySignal =
    displayAction === "POTENTIAL_BUY"
      ? "BUY"
      : displayAction === "SELL"
        ? "SELL"
        : "HOLD";

  return {
    ...chartIntelligence,
    averageVolume: snapshot?.average_volume ?? decisionSupport.liquidity.average_volume,
    rsi: snapshot?.rsi ?? null,
    sma20: snapshot?.sma20 ?? null,
    ema20: snapshot?.ema20 ?? null,
    volatility: snapshot?.volatility ?? null,
    support: snapshot?.support ?? decisionSupport.support,
    resistance: snapshot?.resistance ?? decisionSupport.resistance,
    trend: normalizeTrendDirection(snapshot?.trend ?? decisionSupport.trend),
    averageTurnover: snapshot?.average_turnover ?? decisionSupport.liquidity.average_turnover,
    isBreakout: snapshot?.is_breakout ?? false,
    returnFiveDayPercent: snapshot?.return_5d_percent ?? null,
    returnTwentyDayPercent: snapshot?.return_20d_percent ?? null,
    structure: snapshot?.structure ?? null,
    signal: {
      ...chartIntelligence.signal,
      signal: compatibilitySignal,
      confidence: decision.evidence_strength ?? decision.confidence,
      risk:
        decisionSupport.risk.label === "LOW" ||
        decisionSupport.risk.label === "MEDIUM" ||
        decisionSupport.risk.label === "HIGH"
          ? decisionSupport.risk.label
          : "HIGH",
      reason: decision.primary_reason ?? decision.reasoning[0] ?? "Canonical decision available.",
      supportingContext: [],
      generatedAt:
        decisionSupport.canonical_decision?.as_of_date ??
        decisionSupport.data_freshness.latest_trade_date ??
        chartIntelligence.signal.generatedAt,
      asOfTradeDate:
        decisionSupport.canonical_decision?.as_of_date ??
        decisionSupport.data_freshness.latest_trade_date ??
        undefined,
      source: "backend",
    },
    traderDecision: {
      recommendation: decision.recommendation,
      internal_action: decision.internal_action,
      display_action: displayAction,
      decision_taxonomy_version: decision.decision_taxonomy_version ?? "v1",
      confidence: decision.confidence,
      reason: decision.primary_reason ?? decision.reasoning[0] ?? "Canonical decision available.",
      opportunity_score: decisionSupport.opportunity.score,
      risk_label: decisionSupport.risk.label,
      confidence_semantics: decision.confidence_semantics,
      evidence_strength: decision.evidence_strength,
      evidence_strength_semantics: decision.evidence_strength_semantics,
      primary_reason: decision.primary_reason,
      primary_reason_code: decision.primary_reason_code,
      stance: decision.stance,
      non_holder_action: decision.non_holder_action,
      holder_action: decision.holder_action,
      data_reliability: decisionSupport.data_reliability,
      trading_risk: decisionSupport.trading_risk,
      constraints: decision.constraints,
      opportunity_quality: decision.opportunity_quality,
      entry_readiness: decision.entry_readiness,
      entry_timing: decision.entry_timing,
      entry_condition: decision.entry_condition,
      blocker_codes: decision.blocker_codes,
      canonical: decisionSupport.canonical_decision ?? decision.canonical,
    },
  };
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
      chartContextSignal: "—",
      chartContextConfidence: "—",
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
  const decisionSupport = options.decisionSupport;
  const canonicalDecision = decisionSupport?.decision;
  const chartIntelligence = stock ? buildChartStockIntelligence(stock, prices) : null;
  const intelligence = applyCanonicalDecisionSupport(chartIntelligence, decisionSupport);
  const displayMetrics = options.displayMetrics;
  const support = decisionSupport?.support ?? intelligence?.support ?? null;
  const resistance = decisionSupport?.resistance ?? intelligence?.resistance ?? null;
  const latestPrice =
    displayMetrics?.current_price != null
      ? formatNumber(displayMetrics.current_price)
      : formatNumber(intelligence?.latestPrice);

  return {
    intelligence,
    header: {
      symbol: stock?.symbol ?? "UNKNOWN",
      name: stock?.name ?? "Stock not found",
      exchange: stock?.exchange ?? "DSE",
      sector: stock?.sector ?? "Unclassified",
      category: stock?.category ?? "N/A",
      listingDate: stock?.listing_date ?? null,
      latestPrice,
      changePercent: formatPercent(intelligence?.priceChangePercent),
      marketCap: resolveDisplayedMarketCap(stock, intelligence, decisionSupport, displayMetrics),
      chartContextSignal:
        canonicalDecision?.display_action?.replace("_", " ") ?? "—",
      chartContextConfidence: canonicalDecision
        ? `${canonicalDecision.evidence_strength ?? canonicalDecision.confidence}/100 evidence`
        : "—",
    },
    technicalSummary: [
      {
        key: "trend",
        label: "Trend",
        value: decisionSupport?.trend ?? intelligence?.trend ?? "UNKNOWN",
        helper: "Canonical trend from the decision engine when available.",
      },
      {
        key: "rsi",
        label: "RSI",
        value: formatNumber(intelligence?.rsi),
        helper: "14-session momentum estimate from available closes.",
      },
      {
        key: "volatility",
        label: "Volatility",
        value: formatPercent(intelligence?.volatility),
        helper: "Recent standard deviation of daily percentage changes.",
      },
      {
        key: "avg-volume",
        label: "Avg Volume",
        value: formatCompactNumber(intelligence?.averageVolume),
        helper: "20-session average volume.",
      },
      {
        key: "support",
        label: "Support",
        value: formatNumber(support),
        helper: "Canonical support from the decision engine when available.",
      },
      {
        key: "resistance",
        label: "Resistance",
        value: formatNumber(resistance),
        helper: "Canonical resistance from the decision engine when available.",
      },
    ],
    insights: buildInsights(intelligence),
  };
}
