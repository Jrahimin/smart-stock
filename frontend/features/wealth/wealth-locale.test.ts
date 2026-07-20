import { describe, expect, it } from "vitest";

import {
  getWealthInsightCopy,
  getWealthLandingLanguage,
  getWealthSeasonalCopy,
} from "@/features/wealth/wealth-language";
import { getWealthSnapshotLanguage } from "@/features/wealth/wealth-snapshot-language";
import { getWealthToolsLanguage } from "@/features/wealth/wealth-tools-language";
import type { WealthInsightCard, WealthSeasonalContext } from "@/features/wealth/types/wealth-types";

describe("wealth landing language", () => {
  it("keeps product terms and localizes landing copy", () => {
    const language = getWealthLandingLanguage("bn");

    expect(language.hero.intentLabels["/wealth/tools/fdr"]).toContain("FDR");
    expect(language.scenarios.items.loan.title).toContain("EMI");
    expect(language.comparison.items["dps-vs-fdr"].description).toContain("পথ");
  });

  it("localizes the active seasonal context key", () => {
    const context: WealthSeasonalContext = {
      season_key: "income_tax_season",
      title: "Income tax season — get your estimate in order",
      description:
        "See how salary, investments, and rebates may shape your return before deadline pressure kicks in.",
      cta_label: "Open Tax Planner",
      cta_href: "/wealth/tools/tax-planner",
    };

    expect(getWealthSeasonalCopy(context, "bn")).toMatchObject({
      title: expect.stringContaining("tax"),
      cta_label: "Tax estimate দেখুন",
    });
  });

  it("keeps the ramadan seasonal lens copy for future seasons", () => {
    const context: WealthSeasonalContext = {
      season_key: "ramadan",
      title: "A calm moment for Zakat and giving",
      description: "Use this season to understand eligible wealth, obligations, and what matters most to you.",
      cta_label: "Calculate Zakat",
      cta_href: "/wealth/tools/zakat",
    };

    expect(getWealthSeasonalCopy(context, "bn")).toMatchObject({
      title: expect.stringContaining("Zakat"),
      cta_label: "Zakat হিসাব করুন",
    });
  });

  it("keeps numeric values and dynamic goal names while localizing insight copy", () => {
    const insight: WealthInsightCard = {
      id: "monthly-savings",
      title: "Savings rhythm is visible",
      body: "You are currently tracking about 10,000/month in savings capacity.",
      severity: "POSITIVE",
    };
    const goalInsight: WealthInsightCard = {
      id: "goal-progress",
      title: "Goal in motion: Emergency fund",
      body: "You are about 42.50% toward this goal in the current snapshot.",
      severity: "POSITIVE",
    };

    expect(getWealthInsightCopy(insight, "bn").body).toContain("10,000");
    expect(getWealthInsightCopy(insight, "bn").body).toContain("মাসে");
    expect(getWealthInsightCopy(goalInsight, "bn").title).toContain("Emergency fund");
    expect(getWealthInsightCopy(goalInsight, "bn").body).toContain("42.50%");
    expect(getWealthInsightCopy(insight, "en")).toEqual(insight);
  });

  it("keeps familiar product terms while localizing tool and snapshot guidance", () => {
    const tools = getWealthToolsLanguage("bn");
    const snapshot = getWealthSnapshotLanguage("bn");

    expect(tools.fdr.title).toContain("FDR");
    expect(tools.zakat.learnMore).toContain("যাকাত");
    expect(tools.dps.milestone10Lakh).toContain("10");
    expect(snapshot.hero.title).toBe("Money Snapshot");
    expect(snapshot.upcoming.next30Days).toContain("30");
    expect(getWealthLandingLanguage("bn").snapshot.growthHint).toContain("picture");
  });
});
