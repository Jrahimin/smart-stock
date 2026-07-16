import { describe, expect, it } from "vitest";

import { getSignalsLanguage } from "@/features/signals/signals-language";
import {
  buildLocalizedSignalReason,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";

describe("signals language", () => {
  it("returns bn hero copy", () => {
    const language = getSignalsLanguage("bn");
    expect(language.hero.title).toContain("ট্রেডার");
    expect(language.filters.allActions).toBe("সব action");
  });

  it("localizes known decision reasons via shared dashboard dictionary", () => {
    const language = getSignalsLanguage("bn");
    const reason = buildLocalizedSignalReason(
      {},
      resolveTraderDecisionReason(
        "Uptrend with favorable opportunity and acceptable reward potential.",
        "buy_uptrend_reward",
      ),
      language.signalReasons,
    );

    expect(reason).toContain("Uptrend");
    expect(reason).toContain("সুযোগ");
  });

  it("localizes recommendation-engine reasons via primary_reason_code", () => {
    const language = getSignalsLanguage("bn");
    const reason = buildLocalizedSignalReason(
      {},
      resolveTraderDecisionReason(
        "Reliable bearish trend and momentum evidence supports exit or avoidance.",
        "bearish_directional_evidence",
      ),
      language.signalReasons,
    );

    expect(reason).toContain("bearish trend");
    expect(reason).toContain("exit");
    expect(reason).not.toContain("supports exit or avoidance");
  });
});
