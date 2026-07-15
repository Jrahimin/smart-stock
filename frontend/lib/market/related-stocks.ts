import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export type RelatedStocksGroupId = "sector-peers" | "similar-setup" | "similar-size" | "top-opportunities";

export const RELATED_STOCKS_GROUP_LIMIT = 4;
export const TOP_OPPORTUNITY_SCORE_THRESHOLD = 60;
export const SIMILAR_MARKET_CAP_TOLERANCE = 0.35;

export function normalizeSector(sector: string | null | undefined) {
  return sector?.trim().toLowerCase() ?? "";
}

function getOpportunityScore(stock: StockIntelligenceModel) {
  return stock.traderDecision?.opportunity_score ?? 0;
}

function getRecommendation(stock: StockIntelligenceModel) {
  return stock.traderDecision?.display_action ??
    (stock.traderDecision?.recommendation === "SELL" ? "SELL" : "WAIT");
}

function getMarketCap(stock: StockIntelligenceModel) {
  const cap = stock.marketCap ?? (stock.stock.market_cap != null ? Number(stock.stock.market_cap) : null);
  if (cap === null || cap <= 0) {
    return null;
  }
  return cap;
}

function excludeCurrent(current: StockIntelligenceModel, rows: StockIntelligenceModel[]) {
  return rows.filter((row) => row.stock.id !== current.stock.id);
}

export function filterSectorPeers(
  current: StockIntelligenceModel,
  rows: StockIntelligenceModel[],
  limit = RELATED_STOCKS_GROUP_LIMIT,
) {
  const sector = normalizeSector(current.sector);
  if (!sector || sector === "unclassified") {
    return [];
  }

  return excludeCurrent(current, rows)
    .filter((row) => normalizeSector(row.sector) === sector)
    .sort((left, right) => getOpportunityScore(right) - getOpportunityScore(left))
    .slice(0, limit);
}

export function filterSimilarSetup(
  current: StockIntelligenceModel,
  rows: StockIntelligenceModel[],
  limit = RELATED_STOCKS_GROUP_LIMIT,
) {
  const recommendation = getRecommendation(current);

  return excludeCurrent(current, rows)
    .filter((row) => getRecommendation(row) === recommendation)
    .sort((left, right) => getOpportunityScore(right) - getOpportunityScore(left))
    .slice(0, limit);
}

export function filterSimilarSize(
  current: StockIntelligenceModel,
  rows: StockIntelligenceModel[],
  limit = RELATED_STOCKS_GROUP_LIMIT,
) {
  const currentCap = getMarketCap(current);
  if (currentCap === null) {
    return [];
  }

  const lowerBound = currentCap * (1 - SIMILAR_MARKET_CAP_TOLERANCE);
  const upperBound = currentCap * (1 + SIMILAR_MARKET_CAP_TOLERANCE);

  return excludeCurrent(current, rows)
    .filter((row) => {
      const cap = getMarketCap(row);
      return cap !== null && cap >= lowerBound && cap <= upperBound;
    })
    .sort((left, right) => Math.abs(getMarketCap(left)! - currentCap) - Math.abs(getMarketCap(right)! - currentCap))
    .slice(0, limit);
}

export function filterTopOpportunities(
  current: StockIntelligenceModel,
  rows: StockIntelligenceModel[],
  limit = RELATED_STOCKS_GROUP_LIMIT,
) {
  return excludeCurrent(current, rows)
    .filter((row) => getOpportunityScore(row) >= TOP_OPPORTUNITY_SCORE_THRESHOLD)
    .sort((left, right) => getOpportunityScore(right) - getOpportunityScore(left))
    .slice(0, limit);
}

export function resolveRelatedStockReasons(
  groupId: RelatedStocksGroupId,
  current: StockIntelligenceModel,
  candidate: StockIntelligenceModel,
): string[] {
  switch (groupId) {
    case "sector-peers":
      return ["Same sector"];
    case "similar-setup": {
      const reasons: string[] = [];
      if (current.traderDecision?.display_action === candidate.traderDecision?.display_action) {
        reasons.push("Similar momentum");
      }
      if (current.trend !== "UNKNOWN" && current.trend === candidate.trend) {
        reasons.push("Similar trend");
      }
      return reasons.length ? reasons : ["Similar setup"];
    }
    case "similar-size":
      return ["Similar size"];
    case "top-opportunities":
      return ["High opportunity score"];
    default:
      return [];
  }
}
