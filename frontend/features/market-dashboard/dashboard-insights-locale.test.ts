import { describe, expect, it } from "vitest";

import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import {
  buildTurnoverInsightDescription,
  localizeDashboardInsights,
} from "@/features/market-dashboard/view-models/dashboard-insights-localization";
import type { InsightBlockModel } from "@/lib/insights/insight-types";

const cautiousInsights: InsightBlockModel[] = [
  {
    id: "market-mood",
    title: "Cautious market tone",
    description: "Market direction is mixed; confirmation matters more than headline movement.",
    tone: "warning",
    category: "momentum",
    source: "DETERMINISTIC",
  },
  {
    id: "turnover-context",
    title: "Turnover context",
    description: "Latest turnover is 1.2B.",
    tone: "neutral",
    category: "valuation",
    source: "DETERMINISTIC",
  },
];

describe("dashboard insights localization", () => {
  it("localizes cautious market mood and rich turnover insight copy in bn", () => {
    const language = getDashboardLanguage("bn");
    const localized = localizeDashboardInsights(cautiousInsights, language.insights, language.narratives, {
      marketMood: "Cautious",
      signalCount: 0,
      turnover: {
        turnoverLabel: "BDT 16.7B",
        vsYesterday: "+5.2%",
        vs30DayAvg: "BDT 14.2B",
        liquidityKey: "strong_liquidity",
      },
    });

    expect(localized[0]?.title).toBe("বাজারে সতর্কতা");
    expect(localized[0]?.description).toBe(
      "বাজারের দিকটা mixed; headline movement-এর পেছনে না ছুটে confirmation আসা পর্যন্ত অপেক্ষা করুন।",
    );
    expect(localized[0]?.categoryLabel).toBe("momentum");
    expect(localized[1]?.description).toContain("সর্বশেষ turnover BDT 16.7B");
    expect(localized[1]?.description).toContain("গত session-এর তুলনায় +5.2%");
    expect(localized[1]?.description).toContain("30-session গড় BDT 14.2B");
    expect(localized[1]?.description).toContain("লেনদেন বেশ ভালো");
    expect(localized[1]?.description).toContain("নতুন entry-তে এগুলো আগে দেখুন");
  });

  it("shows missing-data guidance only when turnover is unavailable", () => {
    const language = getDashboardLanguage("bn");
    const localized = localizeDashboardInsights(
      [
        {
          id: "turnover-context",
          title: "Turnover context",
          description: "Turnover data is unavailable.",
          tone: "warning",
          category: "quality",
          source: "DETERMINISTIC",
        },
      ],
      language.insights,
      language.narratives,
      {
        marketMood: "Cautious",
        signalCount: 0,
        turnover: {
          turnoverLabel: "N/A",
          vsYesterday: "N/A",
          vs30DayAvg: "N/A",
          liquidityKey: "average_liquidity",
        },
      },
    );

    expect(localized[0]?.description).toContain("Turnover data এখনো পাওয়া যায়নি");
    expect(localized[0]?.description).not.toContain("সর্বশেষ turnover");
  });

  it("keeps unknown insight ids in english prose", () => {
    const language = getDashboardLanguage("bn");
    const localized = localizeDashboardInsights(
      [
        {
          id: "future-insight",
          title: "New insight",
          description: "Backend added a new card.",
          tone: "info",
          category: "quality",
          source: "DETERMINISTIC",
        },
      ],
      language.insights,
      language.narratives,
      {
        marketMood: "Cautious",
        signalCount: 0,
        turnover: {
          turnoverLabel: "N/A",
          vsYesterday: "N/A",
          vs30DayAvg: "N/A",
          liquidityKey: "average_liquidity",
        },
      },
    );

    expect(localized[0]?.description).toBe("Backend added a new card.");
    expect(localized[0]?.categoryLabel).toBe("ডেটার মান");
  });
});

describe("buildTurnoverInsightDescription", () => {
  it("adds session comparison, average context, and trader guidance in english", () => {
    const language = getDashboardLanguage("en");
    const description = buildTurnoverInsightDescription(
      {
        turnoverLabel: "BDT 16.7B",
        vsYesterday: "+5.2%",
        vs30DayAvg: "BDT 14.2B",
        liquidityKey: "weak_liquidity",
      },
      language.insights,
      language.narratives,
    );

    expect(description).toContain("Latest turnover is BDT 16.7B (+5.2% vs prior session)");
    expect(description).toContain("30-session avg is BDT 14.2B");
    expect(description).toContain("Liquidity is running below the recent average");
    expect(description).toContain("Thin participation raises slippage risk");
  });
});
