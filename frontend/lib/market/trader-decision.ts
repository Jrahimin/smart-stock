import type {
  DecisionDisplayAction,
  TraderRecommendation,
} from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";

export type ResolvedTraderDecision = {
  recommendation: DecisionDisplayAction | null;
  confidence: number;
  evidenceStatus: string;
  reason: string;
  reasonCode: string | null;
  riskLabel: string;
  opportunityScore: number | null;
  entryTiming: string | null;
  entryCondition: string | null;
  entryApplicability?: import("@/lib/api/stock-decision-support-types").EntryApplicabilityDto | null;
  measuredSupport?: string | null;
  opposingConstraint?: string | null;
  source: "decision-engine" | "unavailable";
};

export function resolveVersionedInternalAction(
  internalAction: TraderRecommendation,
  actionTaxonomy: string | null,
  decisionTaxonomyVersion: string | undefined,
): DecisionDisplayAction | null {
  if (actionTaxonomy !== "TRADER_DECISION_V2" || decisionTaxonomyVersion !== "v2") {
    return null;
  }
  if (internalAction === "BUY") {
    return "POTENTIAL_BUY";
  }
  if (internalAction === "SELL") {
    return "SELL";
  }
  return "WAIT";
}

export function resolveWatchlistAction(
  intelligence: StockIntelligenceModel | null,
  isHolding: boolean,
  backendContextualAction?: string | null,
): DecisionDisplayAction | null {
  const decision = intelligence?.traderDecision;
  if (decision && !isHolding) {
    return compatibleDisplayAction(decision);
  }
  const contextualAction = decision?.holder_action ?? backendContextualAction;

  if (contextualAction === "POTENTIAL_BUY" || contextualAction === "BUY") {
    return "POTENTIAL_BUY";
  }
  if (contextualAction === "SELL" || contextualAction === "REDUCE") {
    return "SELL";
  }
  if (contextualAction === "HOLD") {
    return "HOLD";
  }
  if (contextualAction === "WAIT") {
    return "WAIT";
  }

  // A quote/technical row without a canonical decision is an updating state,
  // not evidence for a real WAIT action.
  return null;
}

export function getPreviousSessionRecommendation(stock: StockIntelligenceModel): DecisionDisplayAction | null {
  return stock.publicComparison && stock.publicComparison.status !== "UNCOMPARABLE" && stock.publicComparison.current_action === compatibleDisplayAction(stock.traderDecision) ? stock.publicComparison.previous_action ?? null : null;
}

export function isTraderDecisionChangedThisSession(stock: StockIntelligenceModel): boolean {
  const current = resolveTraderDecision(stock).recommendation;
  const previous = getPreviousSessionRecommendation(stock);

  if (!previous || !current || !stock.latestTradeDate) {
    return false;
  }

  return previous !== current;
}

export function resolveTraderDecision(stock: StockIntelligenceModel): ResolvedTraderDecision {
  if (stock.traderDecision) {
    return {
      recommendation: compatibleDisplayAction(stock.traderDecision),
      confidence: stock.traderDecision.confidence,
      evidenceStatus: stock.traderDecision.evidence_status ?? "UNAVAILABLE",
      reason: stock.traderDecision.reason,
      reasonCode: stock.traderDecision.primary_reason_code ?? null,
      riskLabel: stock.traderDecision.trading_risk?.label ?? stock.traderDecision.risk_label ?? "UNKNOWN",
      opportunityScore: stock.traderDecision.opportunity_score,
      entryTiming: stock.traderDecision.entry_timing ?? null,
      entryCondition: stock.traderDecision.entry_condition ?? null,
      entryApplicability: stock.traderDecision.entry_applicability,
      measuredSupport: stock.traderDecision.measured_support,
      opposingConstraint: stock.traderDecision.opposing_constraint,
      source: "decision-engine",
    };
  }

  return {
    recommendation: null,
    confidence: 0,
    evidenceStatus: "UNAVAILABLE",
    reason: "Decision unavailable; awaiting a validated finalized result.",
    reasonCode: null,
    riskLabel: "UNKNOWN",
    opportunityScore: null,
    entryTiming: null,
    entryCondition: null,
    source: "unavailable",
  };
}

export function getDecisionPriority(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 70) {
    return "high";
  }

  if (confidence >= 58) {
    return "medium";
  }

  return "low";
}

export function getRiskAdjustedDecisionScore(stock: StockIntelligenceModel): number {
  return -(stock.shortlist?.risk_rank ?? Number.MAX_SAFE_INTEGER);
}

export function getVolumeConfirmationScore(stock: StockIntelligenceModel): number {
  return -(stock.shortlist?.volume_rank ?? Number.MAX_SAFE_INTEGER);
}

export function compareCanonicalShortlist(a: StockIntelligenceModel, b: StockIntelligenceModel): number {
  return (a.shortlist?.entry_rank ?? Number.MAX_SAFE_INTEGER) - (b.shortlist?.entry_rank ?? Number.MAX_SAFE_INTEGER)
    || a.stock.symbol.localeCompare(b.stock.symbol) || a.stock.id.localeCompare(b.stock.id);
}

export function getDecisionMomentumHint(stock: StockIntelligenceModel): string {
  const decision = resolveTraderDecision(stock);
  if (decision.recommendation === "POTENTIAL_BUY") {
    return "Entry condition available";
  }
  if (decision.recommendation === "SELL") {
    return "Pressure rising";
  }
  if (decision.recommendation === "WAIT") {
    return "Wait for confirmation";
  }
  return "Hold existing view";
}

export function buildDecisionSupportingContext(stock: StockIntelligenceModel): string[] {
  const context: string[] = [];
  if (stock.rsi !== null) {
    context.push(`RSI ${stock.rsi.toFixed(1)}`);
  }
  if (stock.latestVolumeRatio != null) {
    context.push(`Volume ${stock.latestVolumeRatio.toFixed(1)}x avg`);
  }
  context.push(`Trend ${stock.trend.replace("_", " ").toLowerCase()}`);
  const decision = resolveTraderDecision(stock);
  if (decision.opportunityScore !== null) {
    context.push(`Opportunity ${decision.opportunityScore}`);
  }
  return context;
}

export function isActionableDecision(recommendation: DecisionDisplayAction | null): boolean {
  return recommendation === "POTENTIAL_BUY" || recommendation === "SELL";
}

export function getVolumeBehaviorId(stock: StockIntelligenceModel): string {
  return stock.volumeBehavior ?? "UNKNOWN";
}
