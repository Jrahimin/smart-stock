import type {
  DecisionDisplayAction,
  TraderRecommendation,
} from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export type ResolvedTraderDecision = {
  recommendation: DecisionDisplayAction;
  confidence: number;
  reason: string;
  reasonCode: string | null;
  riskLabel: string;
  opportunityScore: number | null;
  entryTiming: string | null;
  entryCondition: string | null;
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
): DecisionDisplayAction {
  const decision = intelligence?.traderDecision;
  if (decision && !isHolding) {
    return (
      decision.display_action ??
      (decision.recommendation === "SELL" ? "SELL" : "WAIT")
    );
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

  return "WAIT";
}

export function getPreviousSessionRecommendation(stock: StockIntelligenceModel): DecisionDisplayAction | null {
  const persisted = stock.persistedSignal;
  const canonical = stock.traderDecision?.canonical;
  if (
    !persisted ||
    !canonical ||
    !canonical.previous_session_date ||
    persisted.strategyVersion !== canonical.strategy_version ||
    persisted.thresholdVersion !== canonical.threshold_version ||
    persisted.actionTaxonomy !== canonical.action_taxonomy ||
    canonical.decision_taxonomy_version !== "v2" ||
    persisted.signalAsOf !== canonical.previous_session_date ||
    !persisted.canonicalRecommendation
  ) {
    return null;
  }
  return resolveVersionedInternalAction(
    persisted.canonicalRecommendation,
    persisted.actionTaxonomy,
    canonical.decision_taxonomy_version,
  );
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
      recommendation:
        stock.traderDecision.display_action ??
        (stock.traderDecision.recommendation === "SELL" ? "SELL" : "WAIT"),
      confidence: stock.traderDecision.confidence,
      reason: stock.traderDecision.reason,
      reasonCode: stock.traderDecision.primary_reason_code ?? null,
      riskLabel: stock.traderDecision.risk_label,
      opportunityScore: stock.traderDecision.opportunity_score,
      entryTiming: stock.traderDecision.entry_timing ?? null,
      entryCondition: stock.traderDecision.entry_condition ?? null,
      source: "decision-engine",
    };
  }

  return {
    recommendation: "WAIT",
    confidence: Math.min(68, Math.max(45, stock.signal.confidence)),
    reason: "Decision engine unavailable for this row; defaulting to wait.",
    reasonCode: null,
    riskLabel: stock.signal.risk,
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

export function isActionableDecision(recommendation: DecisionDisplayAction): boolean {
  return recommendation === "POTENTIAL_BUY" || recommendation === "SELL";
}

export function getVolumeBehaviorId(stock: StockIntelligenceModel): string {
  return stock.volumeBehavior ?? "UNKNOWN";
}
