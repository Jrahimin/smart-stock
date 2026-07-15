import { describe, expect, it } from "vitest";

import { buildScannerCategoryItems } from "@/features/scanner/scanner-results";
import type {
  BackendScannerConditionId,
  TraderRecommendation,
} from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { resolveTraderDecision } from "@/lib/market/trader-decision";

function scannerStock(
  symbol: string,
  conditionId: BackendScannerConditionId,
  rank: number,
  recommendation: TraderRecommendation,
): StockIntelligenceModel {
  return {
    stock: {
      id: symbol,
      symbol,
      name: `${symbol} Limited`,
      exchange: "DSE",
    },
    scannerConditions: [
      {
        condition_id: conditionId,
        reason_code: "test",
        reason: "Server-owned condition",
        rank_score: 70,
        capacity_score: 10_000_000,
        rank,
      },
    ],
    traderDecision: {
      recommendation,
      confidence: 70,
      reason: "Canonical decision",
      opportunity_score: 60,
      risk_label: "MEDIUM",
    },
  } as unknown as StockIntelligenceModel;
}

describe("scanner results", () => {
  it("uses backend condition ranks independent of universe input order", () => {
    const first = scannerStock("FIRST", "PRICE_VOLUME_BREAKOUT", 1, "BUY");
    const second = scannerStock("SECOND", "PRICE_VOLUME_BREAKOUT", 2, "HOLD");
    const unrelated = scannerStock("RISK", "HIGH_RISK_WATCH", 1, "WAIT");

    const ordered = buildScannerCategoryItems(
      [unrelated, second, first],
      "volume_breakouts",
    );

    expect(ordered.map((stock) => stock.stock.symbol)).toEqual(["FIRST", "SECOND"]);
  });

  it("keeps the scanner badge on the canonical decision result", () => {
    const stock = scannerStock("CANONICAL", "SUPPORT_REBOUND", 1, "SELL");
    const [result] = buildScannerCategoryItems([stock], "support_rebound");

    expect(result).toBe(stock);
    expect(resolveTraderDecision(result).recommendation).toBe("SELL");
    expect(resolveTraderDecision(result).source).toBe("decision-engine");
  });
});
