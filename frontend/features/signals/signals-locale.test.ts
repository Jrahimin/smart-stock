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
      resolveTraderDecisionReason("Uptrend with favorable opportunity and acceptable reward potential."),
      language.signalReasons,
    );

    expect(reason).toContain("Uptrend");
    expect(reason).toContain("সুযোগ");
  });
});
