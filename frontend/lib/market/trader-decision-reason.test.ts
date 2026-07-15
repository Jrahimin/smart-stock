import { describe, expect, it } from "vitest";

import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import {
  buildLocalizedSignalReason,
  resolveDecisionReasonSummary,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";

describe("resolveTraderDecisionReason", () => {
  it.each([
  [
    "Data is not sufficient to take a decision; wait for review.",
    "data_not_eligible",
  ],
  [
    "Uptrend with favorable opportunity and acceptable reward potential.",
    "buy_uptrend_reward",
  ],
  [
    "Uptrend with favorable opportunity and acceptable reward potential",
    "buy_uptrend_reward",
  ],
  [
    "Risk level is LOW; wait for cleaner confirmation rather than forcing a trade.",
    "risk_wait_confirmation",
  ],
  [
    "Reward/risk 1.20 is below the 1.5 minimum; hold rather than buy at this price.",
    "reward_risk_below_minimum",
  ],
  [
    "Confidence capped at 62 in a bearish market regime.",
    "confidence_capped_bearish_regime",
  ],
] as const)("maps %s to %s", (reason, key) => {
    expect(resolveTraderDecisionReason(reason).key).toBe(key);
  });

  it("preserves raw backend prose for unknown reasons", () => {
    const reason = "New backend summary not yet mapped.";
    expect(resolveTraderDecisionReason(reason)).toEqual({
      key: "unknown",
      rawReason: reason,
    });
  });
});

describe("resolveDecisionReasonSummary", () => {
  it("returns raw English prose for unknown keys", () => {
    const rawReason = "New backend summary not yet mapped.";
    const summary = resolveDecisionReasonSummary(
      { key: "unknown", rawReason },
      getDashboardLanguage("bn").signals.decisionReasons,
    );

    expect(summary).toBe(rawReason);
  });

  it("localizes parameterized reasons in bangla", () => {
    const resolved = resolveTraderDecisionReason(
      "Risk level is LOW; wait for cleaner confirmation rather than forcing a trade.",
    );
    const summary = resolveDecisionReasonSummary(
      resolved,
      getDashboardLanguage("bn").signals.decisionReasons,
    );

    expect(summary).toContain("LOW");
    expect(summary).toContain("confirmation");
    expect(summary).not.toContain("forcing a trade");
  });
});

describe("buildLocalizedSignalReason", () => {
  it("renders bangla technical context and decision summary", () => {
    const language = getDashboardLanguage("bn");
    const reason = buildLocalizedSignalReason(
      { rsi: 65.2, volumeRatio: 1.9 },
      resolveTraderDecisionReason(
        "Uptrend with favorable opportunity and acceptable reward potential.",
      ),
      language.signals,
    );

    expect(reason).toContain("RSI 65.2");
    expect(reason).toContain("Volume স্বাভাবিকের তুলনায় 1.9 গুণ");
    expect(reason).toContain("Uptrend-এ ভালো সুযোগ আছে");
    expect(reason).not.toContain("acceptable reward potential");
  });

  it("localizes data eligibility blocks in bangla", () => {
    const language = getDashboardLanguage("bn");
    const reason = buildLocalizedSignalReason(
      { rsi: 55.3, volumeRatio: 1.4 },
      resolveTraderDecisionReason(
        "Data is not eligible for a fresh directional decision; wait for review or refresh.",
      ),
      language.signals,
    );

    expect(reason).toContain("RSI 55.3");
    expect(reason).toContain("নতুন দিকনির্দেশনামূলক সিদ্ধান্তের জন্য ডেটা পর্যাপ্ত নয়");
    expect(reason).not.toContain("Data is not eligible");
  });

  it("keeps unknown backend prose in english inside bangla cards", () => {
    const language = getDashboardLanguage("bn");
    const rawReason = "New backend summary not yet mapped.";
    const reason = buildLocalizedSignalReason(
      { rsi: 61.2 },
      resolveTraderDecisionReason(rawReason),
      language.signals,
    );

    expect(reason).toBe(`RSI 61.2. ${rawReason}`);
  });
});
