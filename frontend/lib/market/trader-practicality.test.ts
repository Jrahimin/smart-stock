import { describe, expect, it } from "vitest";
import { prospectiveDisplayAction, compatibleDisplayAction } from "@/lib/market/decision-action-compatibility";
import { fenceCurrentEntryPayload } from "@/lib/market/current-entry-contract";
import { entryFreshness, entryUniverse, ENTRY_NOW } from "@/test-fixtures/current-entry-fixtures";
import { decisionConditionLabel } from "@/lib/market/decision-presentation";
import { resolveWatchlistAction } from "@/lib/market/trader-decision";

describe("practical decision presentation", () => {
  it("keeps canonical WAIT/SELL while showing the delivered prospective AVOID", () => {
    const decision = { display_action: "WAIT", decision_taxonomy_version: "v2", non_holder_action: "AVOID" };
    expect(compatibleDisplayAction(decision)).toBe("WAIT");
    expect(prospectiveDisplayAction(decision)).toBe("AVOID");
    expect(prospectiveDisplayAction({ ...decision, non_holder_action: undefined })).toBe("WAIT");
    expect(resolveWatchlistAction(null, true, "REVIEW")).toBe("REVIEW");
    expect(resolveWatchlistAction(null, true, "REDUCE")).toBe("REDUCE");
  });
  it("shares unchanged entry objects and only replaces an expired assessment", () => {
    const payload = JSON.parse(JSON.stringify(entryUniverse())) as ReturnType<typeof entryUniverse>;
    expect(fenceCurrentEntryPayload(payload, entryFreshness(), ENTRY_NOW)).toBe(payload);
    const expired = fenceCurrentEntryPayload(payload, entryFreshness(), ENTRY_NOW + 60_000);
    expect(expired).not.toBe(payload);
    expect(expired.rows[0].entry_applicability).toBeNull();
    expect(fenceCurrentEntryPayload(expired, entryFreshness(), ENTRY_NOW + 60_001)).toBe(expired);
  });
  it("never replaces terminal or unverified status with a secondary zone label", () => {
    expect(decisionConditionLabel("regime_plan_not_permitted", { status: "UNVERIFIED", reason_code: "QUOTE_UNUSABLE" }, "en")).toBe("Entry restricted · Market");
    expect(decisionConditionLabel("regime_plan_not_permitted", { status: "EXPIRED", reason_code: "PLAN_EXPIRED" }, "en")).toBe("Expired");
    expect(decisionConditionLabel("entry_plan_not_valid", null, "en")).toBe("No workable plan");
  });
});
