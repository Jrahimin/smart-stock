import type { TraderRecommendation } from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export type ResolvedTraderDecision = {
  recommendation: TraderRecommendation;
  confidence: number;
  reason: string;
  riskLabel: string;
  opportunityScore: number | null;
  source: "decision-engine" | "unavailable";
};

export function resolveWatchlistAction(
  intelligence: StockIntelligenceModel | null,
  isHolding: boolean,
  backendContextualAction?: string | null,
): TraderRecommendation {
  const decision = intelligence?.traderDecision;
  const contextualAction = decision
    ? isHolding
      ? decision.holder_action
      : decision.non_holder_action
    : backendContextualAction;

  if (contextualAction === "BUY") {
    return "BUY";
  }
  if (contextualAction === "SELL" || contextualAction === "REDUCE") {
    return "SELL";
  }
  if (contextualAction === "HOLD") {
    return "HOLD";
  }

  return "WAIT";
}

export function getPreviousSessionRecommendation(stock: StockIntelligenceModel): TraderRecommendation | null {
  const persisted = stock.persistedSignal;
  const canonical = stock.traderDecision?.canonical;
  if (
    !persisted ||
    !canonical ||
    !canonical.previous_session_date ||
    persisted.strategyVersion !== canonical.strategy_version ||
    persisted.thresholdVersion !== canonical.threshold_version ||
    persisted.actionTaxonomy !== canonical.action_taxonomy ||
    persisted.signalAsOf !== canonical.previous_session_date ||
    !persisted.canonicalRecommendation
  ) {
    return null;
  }
  return persisted.canonicalRecommendation;
}

export function isTraderDecisionChangedThisSession(stock: StockIntelligenceModel): boolean {
  const current = resolveTraderDecision(stock).recommendation;
  const previous = getPreviousSessionRecommendation(stock);

  if (!previous || !stock.latestTradeDate) {
    return false;
  }

  return previous !== current;
}

export function resolveTraderDecision(stock: StockIntelligenceModel): ResolvedTraderDecision {
  if (stock.traderDecision) {
    return {
      recommendation: stock.traderDecision.recommendation,
      confidence: stock.traderDecision.confidence,
      reason: stock.traderDecision.reason,
      riskLabel: stock.traderDecision.risk_label,
      opportunityScore: stock.traderDecision.opportunity_score,
      source: "decision-engine",
    };
  }

  return {
    recommendation: "WAIT",
    confidence: Math.min(68, Math.max(45, stock.signal.confidence)),
    reason: "Decision engine unavailable for this row; defaulting to wait.",
    riskLabel: stock.signal.risk,
    opportunityScore: null,
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
  const decision = resolveTraderDecision(stock);
  const riskPenalty =
    decision.riskLabel === "HIGH" || decision.riskLabel === "SPECULATIVE"
      ? 24
      : decision.riskLabel === "MEDIUM"
        ? 10
        : 0;
  return decision.confidence - riskPenalty;
}

export function getVolumeConfirmationScore(stock: StockIntelligenceModel): number {
  const decision = resolveTraderDecision(stock);
  const volumeRatio = stock.averageVolume && stock.averageVolume > 0 ? stock.volume / stock.averageVolume : 1;
  return decision.confidence + Math.min(30, volumeRatio * 10);
}

export function getDecisionMomentumHint(stock: StockIntelligenceModel): string {
  const decision = resolveTraderDecision(stock);
  if (decision.recommendation === "BUY") {
    return "Momentum expanding";
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
  if (stock.averageVolume && stock.averageVolume > 0) {
    context.push(`Volume ${(stock.volume / stock.averageVolume).toFixed(1)}x avg`);
  }
  context.push(`Trend ${stock.trend.replace("_", " ").toLowerCase()}`);
  const decision = resolveTraderDecision(stock);
  if (decision.opportunityScore !== null) {
    context.push(`Opportunity ${decision.opportunityScore}`);
  }
  return context;
}

export function isActionableDecision(recommendation: TraderRecommendation): boolean {
  return recommendation === "BUY" || recommendation === "SELL";
}

export function getVolumeBehaviorId(stock: StockIntelligenceModel): string {
  return stock.volumeBehavior ?? "UNKNOWN";
}
