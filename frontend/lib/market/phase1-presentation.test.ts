import { describe, expect, it } from "vitest";
import { evidenceLabel, controllingReasonLabel } from "./decision-presentation";
import { freshnessGenerationToken, responseMatchesMarketFreshness, summaryMatchesFreshness } from "./market-generation";
import { resolveTraderDecision, compareCanonicalShortlist } from "./trader-decision";
import type { StockIntelligenceModel } from "./market-intelligence-types";

describe("Phase 1 presentation contract", () => {
  it("labels unavailable and balanced evidence without heuristic percentages", () => {
    expect(evidenceLabel("UNAVAILABLE", "en")).toBe("Evidence unavailable");
    expect(evidenceLabel("MIXED", "bn")).toBe("মিশ্র সংকেত");
    expect(controllingReasonLabel("regime_plan_not_permitted", "", "en")).toContain("market regime blocks");
    expect(evidenceLabel("BULLISH")).not.toContain("%");
  });
  it("accepts yesterday's finalized decision with today's quote identity and rejects corrections", () => {
    const payload = { market_sync_id: "d1", decision_generation_id: "d1", quote_generation_id: "q2" };
    expect(responseMatchesMarketFreshness(payload, "q2|d1")).toBe(true);
    expect(responseMatchesMarketFreshness(payload, "q2|d2")).toBe(false);
    expect(responseMatchesMarketFreshness(payload, "q3|d1")).toBe(false);
    expect(summaryMatchesFreshness({ market_sync_id: "d1", decision_generation_id: "d1" },
      { market_sync_id: "q2", decision_generation_id: "d1" })).toBe(true);
  });
  it("refreshes the prior generation when publication becomes updating", () => {
    const current = { market_sync_id: "q2", decision_generation_id: "d1", decision_status: "CURRENT" };
    const updating = { ...current, decision_status: "UPDATING" };
    expect(freshnessGenerationToken(updating)).toBe("q2|d1|UPDATING");
    expect(responseMatchesMarketFreshness(current, freshnessGenerationToken(updating))).toBe(false);
    expect(responseMatchesMarketFreshness(updating, freshnessGenerationToken(updating))).toBe(true);
  });
  it("uses server rank instead of fabricated fallback evidence or client score bonuses", () => {
    const row = (symbol:string, rank:number, confidence:number) => ({ stock:{symbol,id:symbol}, shortlist:{entry_rank:rank}, signal:{confidence,risk:"LOW"} }) as StockIntelligenceModel;
    const blocked = row("APSCLBOND", 5, 100), eligible = row("SPCL", 1, 1);
    expect(compareCanonicalShortlist(eligible, blocked)).toBeLessThan(0);
    expect(resolveTraderDecision(blocked)).toMatchObject({ source:"unavailable", confidence:0, evidenceStatus:"UNAVAILABLE", entryCondition:null });
  });
});
