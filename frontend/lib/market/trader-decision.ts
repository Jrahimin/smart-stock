import type { SignalType, TraderRecommendation } from "@/lib/api/backend-api-types";
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
  backendRecommendation?: TraderRecommendation | null,
): TraderRecommendation {
  if (intelligence) {
    return resolveTraderDecision(intelligence).recommendation;
  }

  return backendRecommendation ?? "WAIT";
}

function getPriorTradeDate(stock: StockIntelligenceModel): string | null {
  if (!stock.latestTradeDate) {
    return null;
  }

  const priorDates = stock.prices
    .map((price) => price.trade_date)
    .filter((tradeDate) => tradeDate < stock.latestTradeDate!)
    .sort();

  return priorDates.at(-1) ?? null;
}

export function getPreviousSessionRecommendation(stock: StockIntelligenceModel): TraderRecommendation | null {
  const persisted = stock.persistedSignal;
  if (!persisted || !stock.latestTradeDate) {
    return null;
  }

  if (persisted.asOfTradeDate === stock.latestTradeDate) {
    return mapPersistedSignalToRecommendation(persisted.signal);
  }

  const priorTradeDate = getPriorTradeDate(stock);
  if (priorTradeDate && persisted.asOfTradeDate === priorTradeDate) {
    return mapPersistedSignalToRecommendation(persisted.signal);
  }

  return null;
}

export function isTraderDecisionChangedThisSession(stock: StockIntelligenceModel): boolean {
  const current = resolveTraderDecision(stock).recommendation;
  const previous = getPreviousSessionRecommendation(stock);

  if (!previous || !stock.latestTradeDate) {
    return false;
  }

  return previous !== current;
}

export function mapPersistedSignalToRecommendation(signal: SignalType): TraderRecommendation {
  if (signal === "BUY") {
    return "BUY";
  }
  if (signal === "SELL") {
    return "SELL";
  }
  return "HOLD";
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

export function isBreakdownRiskDecision(stock: StockIntelligenceModel): boolean {
  const decision = resolveTraderDecision(stock);
  return decision.recommendation === "SELL" || decision.riskLabel === "HIGH" || decision.riskLabel === "SPECULATIVE";
}

export function isActionableDecision(recommendation: TraderRecommendation): boolean {
  return recommendation === "BUY" || recommendation === "SELL";
}

export function getVolumeBehaviorId(stock: StockIntelligenceModel): string {
  if (!stock.averageVolume || stock.averageVolume <= 0) {
    return "NORMAL";
  }

  const ratio = stock.volume / stock.averageVolume;
  if (ratio >= 1.8) {
    return "EXPANSION";
  }

  if (ratio <= 0.55) {
    return "THIN";
  }

  return "NORMAL";
}
