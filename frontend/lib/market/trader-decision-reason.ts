import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { resolveTraderDecision } from "@/lib/market/trader-decision";

export type TraderDecisionReasonKey =
  | "stale_sparse_data"
  | "corporate_action_adjustment"
  | "failed_support"
  | "support_break"
  | "data_not_eligible"
  | "buy_uptrend_reward"
  | "buy_uptrend_resistance_test"
  | "uptrend_near_resistance_wait_volume"
  | "high_risk_selective_setup"
  | "bearish_structure"
  | "bearish_directional_evidence"
  | "risk_wait_confirmation"
  | "fresh_entry_risk_block"
  | "entry_plan_not_valid"
  | "momentum_extended_wait_entry"
  | "momentum_elevated_hold"
  | "extended_momentum"
  | "near_resistance_no_uptrend"
  | "near_resistance_constructive"
  | "constructive_hold"
  | "constructive_watch"
  | "sideways_constructive_monitor"
  | "no_directional_edge"
  | "reward_risk_below_minimum"
  | "lower_structure_hold"
  | "lower_structure_conflict"
  | "bearish_regime_hold"
  | "bullish_setup_downgraded"
  | "bullish_setup_valid_entry"
  | "bullish_setup_ready"
  | "bullish_setup_pullback"
  | "bullish_setup_breakout"
  | "bullish_setup_continuation"
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
    key: "support_break",
    test: /^Price has failed recent support on eligible data\.?$/i,
  },
  {
    key: "data_not_eligible",
    test:
      /^Data is not eligible for a fresh directional decision; wait for review or refresh\.?$/i,
  },
  {
    key: "data_not_eligible",
    test: /^Data is not sufficient to take a decision; wait for review\.?$/i,
  },
  {
    key: "bearish_directional_evidence",
    test:
      /^Reliable bearish trend and momentum evidence supports exit or avoidance\.?$/i,
  },
  {
    key: "fresh_entry_risk_block",
    test:
      /^Trading risk is ([A-Z]+) or tradability is inadequate; wait rather than forcing a fresh entry\.?$/i,
    params: (match) => ({ riskLabel: match[1] }),
  },
  {
    key: "entry_plan_not_valid",
    test:
      /^Bullish evidence lacks a safe actionable entry plan; non-holders should wait\.?$/i,
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
    key: "extended_momentum",
    test:
      /^Momentum is extended; holders may hold while non-holders wait for a better entry\.?$/i,
  },
  {
    key: "near_resistance_constructive",
    test:
      /^The setup is constructive near resistance; wait for a confirmed price break\.?$/i,
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
    key: "constructive_watch",
    test:
      /^Structure remains constructive; holders may hold while non-holders wait\.?$/i,
  },
  {
    key: "sideways_constructive_monitor",
    test: /^Sideways base with constructive opportunity; monitor for directional confirmation\.?$/i,
  },
  {
    key: "no_directional_edge",
    test: /^No strong directional edge(?: is present)?; patience is preferred\.?$/i,
  },
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
    key: "lower_structure_conflict",
    test:
      /^Lower market structure conflicts with a fresh buy; hold rather than add exposure\.?$/i,
  },
  {
    key: "bullish_setup_downgraded",
    test:
      /^The bullish setup is constructive, but an authoritative constraint blocks a fresh entry\.?$/i,
  },
  {
    key: "bullish_setup_valid_entry",
    test:
      /^Strong completed-session evidence aligns with a valid, meaningful entry condition\.?$/i,
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

const PRIMARY_REASON_CODE_MAP: Record<string, TraderDecisionReasonKey> = {
  data_not_eligible: "data_not_eligible",
  support_break: "support_break",
  bearish_directional_evidence: "bearish_directional_evidence",
  fresh_entry_risk_block: "fresh_entry_risk_block",
  entry_plan_not_valid: "entry_plan_not_valid",
  bearish_market_regime: "bearish_regime_hold",
  near_resistance: "near_resistance_constructive",
  extended_momentum: "extended_momentum",
  lower_structure: "lower_structure_conflict",
  bullish_setup_downgraded: "bullish_setup_downgraded",
  bullish_setup_valid_entry: "bullish_setup_valid_entry",
  constructive_watch: "constructive_watch",
  no_directional_edge: "no_directional_edge",
};

const BULLISH_SETUP_TIMING_SUFFIXES = new Set([
  "ready",
  "pullback",
  "breakout",
  "continuation",
  "valid_entry",
]);

function normalizeReasonText(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}

function resolveReasonKeyFromPrimaryReasonCode(code: string): TraderDecisionReasonKey | null {
  const normalized = code.trim().toLowerCase();
  const direct = PRIMARY_REASON_CODE_MAP[normalized];
  if (direct) {
    return direct;
  }

  if (normalized.startsWith("bullish_setup_")) {
    const suffix = normalized.slice("bullish_setup_".length);
    if (BULLISH_SETUP_TIMING_SUFFIXES.has(suffix)) {
      return `bullish_setup_${suffix}` as TraderDecisionReasonKey;
    }
    return "bullish_setup_valid_entry";
  }

  return null;
}

function extractParamsForReasonKey(
  key: TraderDecisionReasonKey,
  rawReason: string,
): TraderDecisionReasonParams | undefined {
  if (key === "fresh_entry_risk_block" || key === "risk_wait_confirmation") {
    const riskLabel =
      rawReason.match(/Trading risk is ([A-Z]+)/i)?.[1] ??
      rawReason.match(/Risk level is ([A-Z]+)/i)?.[1];
    return riskLabel ? { riskLabel } : undefined;
  }

  if (key === "reward_risk_below_minimum") {
    const match = rawReason.match(
      /Reward\/risk ([\d.]+) is below the ([\d.]+) minimum/i,
    );
    if (match) {
      return {
        riskReward: Number.parseFloat(match[1] ?? ""),
        minRiskReward: Number.parseFloat(match[2] ?? ""),
      };
    }
  }

  if (key === "confidence_capped_bearish_regime") {
    const match = rawReason.match(/Confidence capped at (\d+)/i);
    if (match) {
      return { confidenceCap: Number.parseInt(match[1] ?? "", 10) };
    }
  }

  return undefined;
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

export function resolveTraderDecisionReason(
  reason: string,
  reasonCode?: string | null,
): ResolvedTraderDecisionReason {
  const rawReason = normalizeReasonText(reason);
  const codeKey = reasonCode ? resolveReasonKeyFromPrimaryReasonCode(reasonCode) : null;

  if (codeKey) {
    return {
      key: codeKey,
      params: extractParamsForReasonKey(codeKey, rawReason),
      rawReason,
    };
  }

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
