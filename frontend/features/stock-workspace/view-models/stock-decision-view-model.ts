import type { PatternDetectionDto, StockDecisionSupportDto } from "@/lib/api/stock-decision-support-types";
import {
  formatFinancialDisplay,
  formatMarketCapBdt,
  formatNumber,
  formatPercent,
} from "@/lib/formatters/financial-formatters";

export type DecisionSignal = {
  tone: "positive" | "warning";
  text: string;
};

export type PricePositionVisual = {
  support: number | null;
  current: number | null;
  resistance: number | null;
  percentTowardResistance: number | null;
};

export type TradePlanVisual = {
  entryLow: number | null;
  entryHigh: number | null;
  current: number | null;
  stopLoss: number | null;
  target: number | null;
  riskReward: number | null;
};

export type StockDecisionViewModel = {
  available: boolean;
  recommendation: string;
  confidence: number;
  confidenceLabel: string;
  recommendationTone: "buy" | "hold" | "wait" | "sell" | "neutral";
  decisionSignals: DecisionSignal[];
  opportunityScore: number;
  opportunityComponents: Array<{ label: string; score: number; explanation: string }>;
  riskScore: number;
  riskLabel: string;
  riskComponents: Array<{ label: string; score: number; explanation: string }>;
  pricePositionVisual: PricePositionVisual;
  tradePlanVisual: TradePlanVisual;
  liquidity: { label: string; explanation: string; volumeRatio: string };
  warnings: Array<{ title: string; message: string; severity: string; code: string }>;
  topWarnings: Array<{ title: string; message: string; severity: string; code: string }>;
  freshness: { label: string; helper: string; isStale: boolean };
  chartPatterns: PatternDetectionDto[];
  primaryPattern: PatternDetectionDto | null;
  secondaryPattern: PatternDetectionDto | null;
  breakout: StockDecisionSupportDto["breakout"];
  ownership: StockDecisionSupportDto["ownership"];
  valuation: StockDecisionSupportDto["valuation"];
  events: StockDecisionSupportDto["events"];
  support: number | null;
  resistance: number | null;
  trend: string;
};

const recommendationToneMap = {
  BUY: "buy",
  HOLD: "hold",
  WAIT: "wait",
  SELL: "sell",
} as const;

function buildDecisionSignals(decision: StockDecisionSupportDto): DecisionSignal[] {
  const signals: DecisionSignal[] = [];
  const trend = decision.opportunity.components.find((component) => component.key === "trend");
  const momentum = decision.opportunity.components.find((component) => component.key === "momentum");
  const volume = decision.opportunity.components.find((component) => component.key === "volume");

  if (decision.trend === "UPTREND" || (trend && trend.score >= 60)) {
    signals.push({ tone: "positive", text: "Uptrend intact" });
  } else if (decision.trend === "DOWNTREND" || (trend && trend.score <= 40)) {
    signals.push({ tone: "warning", text: "Trend under pressure" });
  }

  if (momentum && momentum.score >= 55) {
    signals.push({ tone: "positive", text: "Momentum healthy" });
  } else if (momentum && momentum.score <= 40) {
    signals.push({ tone: "warning", text: "Momentum fading" });
  }

  if (volume && volume.score >= 55) {
    signals.push({ tone: "positive", text: "Volume above average" });
  } else if (volume && volume.score <= 45) {
    signals.push({ tone: "warning", text: "Weak volume confirmation" });
  }

  const warningSignal = decision.warnings.find((warning) =>
    ["near_resistance", "below_support", "rsi_overheated", "thin_liquidity", "category_z", "high_volatility"].includes(warning.code),
  );
  if (warningSignal) {
    signals.push({ tone: "warning", text: warningSignal.title });
  }

  return signals.slice(0, 4);
}

function computePercentTowardResistance(support: number | null, resistance: number | null, current: number | null) {
  if (support === null || resistance === null || current === null || resistance <= support) {
    return null;
  }
  return Math.max(0, Math.min(100, ((current - support) / (resistance - support)) * 100));
}

export function buildStockDecisionViewModel(decision: StockDecisionSupportDto | null | undefined): StockDecisionViewModel {
  if (!decision) {
    return {
      available: false,
      recommendation: "—",
      confidence: 0,
      confidenceLabel: "N/A",
      recommendationTone: "neutral",
      decisionSignals: [],
      opportunityScore: 0,
      opportunityComponents: [],
      riskScore: 0,
      riskLabel: "N/A",
      riskComponents: [],
      pricePositionVisual: { support: null, current: null, resistance: null, percentTowardResistance: null },
      tradePlanVisual: { entryLow: null, entryHigh: null, current: null, stopLoss: null, target: null, riskReward: null },
      liquidity: { label: "N/A", explanation: "", volumeRatio: "N/A" },
      warnings: [],
      topWarnings: [],
      freshness: { label: "Unavailable", helper: "", isStale: false },
      chartPatterns: [],
      primaryPattern: null,
      secondaryPattern: null,
      breakout: null,
      ownership: null,
      valuation: null,
      events: [],
      support: null,
      resistance: null,
      trend: "UNKNOWN",
    };
  }

  const warnings = decision.warnings.map((warning) => ({
    title: warning.title,
    message: warning.message,
    severity: warning.severity,
    code: warning.code,
  }));

  return {
    available: true,
    recommendation: decision.decision.recommendation,
    confidence: decision.decision.confidence,
    confidenceLabel: `${decision.decision.confidence}%`,
    recommendationTone: recommendationToneMap[decision.decision.recommendation] ?? "neutral",
    decisionSignals: buildDecisionSignals(decision),
    opportunityScore: decision.opportunity.score,
    opportunityComponents: decision.opportunity.components.map((component) => ({
      label: component.label,
      score: component.score,
      explanation: component.explanation,
    })),
    riskScore: decision.risk.score,
    riskLabel: decision.risk.label,
    riskComponents: decision.risk.components.map((component) => ({
      label: component.label,
      score: component.score,
      explanation: component.explanation,
    })),
    pricePositionVisual: {
      support: decision.support,
      current: decision.price_position.current_price,
      resistance: decision.resistance,
      percentTowardResistance: computePercentTowardResistance(
        decision.support,
        decision.resistance,
        decision.price_position.current_price,
      ),
    },
    tradePlanVisual: {
      entryLow: decision.trade_plan.entry_zone_low,
      entryHigh: decision.trade_plan.entry_zone_high,
      current: decision.price_position.current_price,
      stopLoss: decision.trade_plan.stop_loss,
      target: decision.trade_plan.target_high,
      riskReward: decision.trade_plan.risk_reward_ratio,
    },
    liquidity: {
      label: decision.liquidity.label,
      explanation: decision.liquidity.explanation,
      volumeRatio:
        decision.liquidity.latest_volume_ratio !== null ? `${decision.liquidity.latest_volume_ratio.toFixed(1)}x avg` : "N/A",
    },
    warnings,
    topWarnings: warnings.slice(0, 3),
    freshness: {
      label: decision.data_freshness.is_stale ? "Stale" : decision.data_freshness.is_sparse ? "Sparse" : "Fresh",
      helper: `${decision.data_freshness.ohlcv_row_count} candles · ${decision.data_freshness.latest_trade_date ?? "unknown"}`,
      isStale: decision.data_freshness.is_stale || decision.data_freshness.is_sparse,
    },
    chartPatterns: decision.patterns.slice(0, 2),
    primaryPattern: decision.patterns[0] ?? null,
    secondaryPattern: decision.patterns[1] ?? null,
    breakout: decision.breakout,
    ownership: decision.ownership,
    valuation: decision.valuation,
    events: decision.events.slice(0, 5),
    support: decision.support,
    resistance: decision.resistance,
    trend: decision.trend,
  };
}

export function formatOwnershipPercent(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => `${parsed.toFixed(1)}%`);
}

export function formatValuationMetric(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => formatNumber(parsed));
}

export function formatMarketCap(value: number | null | undefined) {
  return formatFinancialDisplay(value, (parsed) => formatMarketCapBdt(parsed));
}


export function patternDirectionClass(direction: string) {
  if (direction === "bullish") {
    return "pattern-chip-bullish";
  }
  if (direction === "bearish") {
    return "pattern-chip-bearish";
  }
  return "pattern-chip-neutral";
}
