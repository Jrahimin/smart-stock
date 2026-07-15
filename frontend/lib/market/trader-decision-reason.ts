import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { resolveTraderDecision } from "@/lib/market/trader-decision";

export type TraderDecisionReasonKey =
  | "stale_sparse_data"
  | "corporate_action_adjustment"
  | "failed_support"
  | "data_not_eligible"
  | "buy_uptrend_reward"
  | "buy_uptrend_resistance_test"
  | "uptrend_near_resistance_wait_volume"
  | "high_risk_selective_setup"
  | "bearish_structure"
  | "risk_wait_confirmation"
  | "momentum_extended_wait_entry"
  | "momentum_elevated_hold"
  | "near_resistance_no_uptrend"
  | "constructive_hold"
  | "sideways_constructive_monitor"
  | "no_directional_edge"
  | "reward_risk_below_minimum"
  | "lower_structure_hold"
  | "bearish_regime_hold"
  | "confidence_capped_bearish_regime"
  | "decision_engine_unavailable"
  | "unknown";

export type TraderDecisionReasonParams = {
  riskLabel?: string;
  riskReward?: number;
  minRiskReward?: number;
  confidenceCap?: number;
};

export type DecisionReasonTemplate =
  | string
  | ((params: TraderDecisionReasonParams) => string);

export type DecisionReasonCopy = Record<TraderDecisionReasonKey, DecisionReasonTemplate>;

export type ResolvedTraderDecisionReason = {
  key: TraderDecisionReasonKey;
  params?: TraderDecisionReasonParams;
  rawReason: string;
};

export type SignalTechnicalContext = {
  rsi?: number;
  volumeRatio?: number;
  trend?: string;
  opportunityScore?: number;
};

export type SignalReasonCopy = {
  contextJoiner: string;
  contextRsi: (value: string) => string;
  contextVolume: (ratio: string) => string;
  contextTrend: (value: string) => string;
  contextOpportunity: (value: number) => string;
  decisionReasons: DecisionReasonCopy;
};

type ReasonPattern = {
  key: Exclude<TraderDecisionReasonKey, "unknown">;
  test: RegExp;
  params?: (match: RegExpMatchArray) => TraderDecisionReasonParams;
};

const REASON_PATTERNS: ReasonPattern[] = [
  {
    key: "stale_sparse_data",
    test: /^Data is stale or sparse; wait for fresher confirmation\.?$/i,
  },
  {
    key: "corporate_action_adjustment",
    test:
      /^Sharp single-session drop looks like a corporate-action\/ex-date adjustment rather than a breakdown; wait for confirmation\.?$/i,
  },
  { key: "failed_support", test: /^Price has failed recent support\.?$/i },
  {
    key: "data_not_eligible",
    test:
      /^Data is not eligible for a fresh directional decision; wait for review or refresh\.?$/i,
  },
  {
    key: "buy_uptrend_reward",
    test: /^Uptrend with favorable opportunity and acceptable reward potential\.?$/i,
  },
  {
    key: "buy_uptrend_resistance_test",
    test: /^Uptrend with favorable opportunity and resistance test participation\.?$/i,
  },
  {
    key: "uptrend_near_resistance_wait_volume",
    test: /^Uptrend is constructive near resistance; wait for stronger volume confirmation\.?$/i,
  },
  {
    key: "high_risk_selective_setup",
    test: /^High-risk name with strong trend and participation; treat as a selective setup\.?$/i,
  },
  { key: "bearish_structure", test: /^Bearish structure dominates the setup\.?$/i },
  {
    key: "risk_wait_confirmation",
    test: /^Risk level is (.+); wait for cleaner confirmation rather than forcing a trade\.?$/i,
    params: (match) => ({ riskLabel: match[1] }),
  },
  {
    key: "momentum_extended_wait_entry",
    test: /^Momentum is extended near resistance; wait for a better entry\.?$/i,
  },
  {
    key: "momentum_elevated_hold",
    test: /^Momentum is elevated but the uptrend remains intact; hold rather than chase\.?$/i,
  },
  {
    key: "near_resistance_no_uptrend",
    test: /^Price is near resistance without an uptrend; wait for confirmation\.?$/i,
  },
  {
    key: "constructive_hold",
    test: /^Structure remains constructive; hold existing positions or wait for cleaner entry\.?$/i,
  },
  {
    key: "sideways_constructive_monitor",
    test: /^Sideways base with constructive opportunity; monitor for directional confirmation\.?$/i,
  },
  { key: "no_directional_edge", test: /^No strong directional edge; patience is preferred\.?$/i },
  {
    key: "reward_risk_below_minimum",
    test: /^Reward\/risk ([\d.]+) is below the ([\d.]+) minimum; hold rather than buy at this price\.?$/i,
    params: (match) => ({
      riskReward: Number.parseFloat(match[1] ?? ""),
      minRiskReward: Number.parseFloat(match[2] ?? ""),
    }),
  },
  {
    key: "lower_structure_hold",
    test:
      /^Market structure shows lower highs and lower lows; hold rather than buy into weakness\.?$/i,
  },
  {
    key: "bearish_regime_hold",
    test: /^Broad market regime is bearish; hold rather than open new long exposure\.?$/i,
  },
  {
    key: "confidence_capped_bearish_regime",
    test: /^Confidence capped at (\d+) in a bearish market regime\.?$/i,
    params: (match) => ({ confidenceCap: Number.parseInt(match[1] ?? "", 10) }),
  },
  {
    key: "decision_engine_unavailable",
    test: /^Decision engine unavailable for this row; defaulting to wait\.?$/i,
  },
];

function normalizeReasonText(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

function matchReasonPattern(rawReason: string): ResolvedTraderDecisionReason | null {
  const candidates = [rawReason, rawReason.endsWith(".") ? rawReason.slice(0, -1) : `${rawReason}.`];

  for (const candidate of candidates) {
    for (const pattern of REASON_PATTERNS) {
      const match = candidate.match(pattern.test);
      if (match) {
        return {
          key: pattern.key,
          params: pattern.params?.(match),
          rawReason,
        };
      }
    }
  }

  return null;
}

export function resolveTraderDecisionReason(reason: string): ResolvedTraderDecisionReason {
  const rawReason = normalizeReasonText(reason);
  const matched = matchReasonPattern(rawReason);

  if (matched) {
    return matched;
  }

  return { key: "unknown", rawReason };
}

export function buildSignalTechnicalContext(stock: StockIntelligenceModel): SignalTechnicalContext {
  const context: SignalTechnicalContext = {};

  if (stock.rsi !== null) {
    context.rsi = stock.rsi;
  }

  if (stock.averageVolume && stock.averageVolume > 0) {
    context.volumeRatio = stock.volume / stock.averageVolume;
  }

  context.trend = stock.trend.replace("_", " ").toLowerCase();
  const opportunityScore = resolveTraderDecision(stock).opportunityScore;
  if (opportunityScore !== null) {
    context.opportunityScore = opportunityScore;
  }

  return context;
}

export function buildLocalizedSignalSupportingContext(
  technicalContext: SignalTechnicalContext,
  copy: SignalReasonCopy,
): string[] {
  return [
    technicalContext.rsi !== undefined ? copy.contextRsi(technicalContext.rsi.toFixed(1)) : null,
    technicalContext.volumeRatio !== undefined ? copy.contextVolume(technicalContext.volumeRatio.toFixed(1)) : null,
    technicalContext.trend ? copy.contextTrend(technicalContext.trend) : null,
    technicalContext.opportunityScore !== undefined ? copy.contextOpportunity(technicalContext.opportunityScore) : null,
  ].filter((value): value is string => Boolean(value));
}

export function resolveDecisionReasonSummary(
  resolvedReason: ResolvedTraderDecisionReason,
  decisionReasons: DecisionReasonCopy,
): string {
  if (resolvedReason.key === "unknown") {
    return resolvedReason.rawReason;
  }

  const template = decisionReasons[resolvedReason.key];
  return typeof template === "function"
    ? template(resolvedReason.params ?? {})
    : template;
}

export function buildLocalizedSignalReason(
  technicalContext: SignalTechnicalContext,
  resolvedReason: ResolvedTraderDecisionReason,
  copy: SignalReasonCopy,
): string {
  const parts: string[] = [];

  if (technicalContext.rsi !== undefined) {
    parts.push(copy.contextRsi(technicalContext.rsi.toFixed(1)));
  }

  if (technicalContext.volumeRatio !== undefined) {
    parts.push(copy.contextVolume(technicalContext.volumeRatio.toFixed(1)));
  }

  const summary = resolveDecisionReasonSummary(resolvedReason, copy.decisionReasons);
  return parts.length ? `${parts.join(copy.contextJoiner)}. ${summary}` : summary;
}
