import { describe, expect, it } from "vitest";

import { getSignalsLanguage } from "@/features/signals/signals-language";
import {
  buildLocalizedSignalReason,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";

describe("signals language", () => {
  it("returns bn hero copy", () => {
    const language = getSignalsLanguage("bn");
    expect(language.hero.title).toBe("বিশ্লেষণ সহ ট্রেডের সিদ্ধান্ত");
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

    expect(reason).toContain("দাম ঊর্ধ্বমুখী");
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

    expect(reason).toContain("দামের প্রবণতা ও গতি দুটোই নিম্নমুখী");
    expect(reason).toContain("বিক্রি বা এড়িয়ে যাওয়ার");
    expect(reason).not.toContain("supports exit or avoidance");
  });
});
