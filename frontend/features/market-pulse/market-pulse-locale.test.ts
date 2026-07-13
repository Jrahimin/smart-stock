import { describe, expect, it } from "vitest";

import {
  getMarketPulseLanguage,
  localizePulseBriefingChips,
} from "@/features/market-pulse/market-pulse-language";
import { applyMarketPulseLocalization } from "@/features/market-pulse/view-models/market-pulse-view-model";
import type { MarketPulseModel } from "@/features/market-pulse/types/market-pulse-types";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

describe("market pulse language", () => {
  it("defaults to bn copy for hero and states", () => {
    const language = getMarketPulseLanguage(DEFAULT_LOCALE);
    expect(language.hero.eyebrow).toBe("Market Pulse");
    expect(language.states.unavailable).toContain("পাওয়া যাচ্ছে না");
  });

  it("localizes briefing chip labels by stable id", () => {
    const chips = localizePulseBriefingChips(
      [
        { id: "session", label: "Market", value: "OPEN", tone: "info" },
        { id: "in-focus", label: "In Focus", value: "3", tone: "primary" },
      ],
      "bn",
    );

    expect(chips[0]?.label).toBe("বাজার");
    expect(chips[1]?.label).toBe("নজরে");
  });

  it("keeps en chip labels unchanged", () => {
    const chips = localizePulseBriefingChips(
      [{ id: "active-alerts", label: "Active Alerts", value: "2", tone: "warning" }],
      "en",
    );

    expect(chips[0]?.label).toBe("Active Alerts");
  });

  it("localizes rendered Market Pulse explanations from stable model facts", () => {
    const model = {
      hero: {
        greeting: "Good morning",
        attentionHeadline: "Story of the day",
        attentionSubline: "English backend subtitle",
        lastUpdatedLabel: null,
        relativeUpdatedLabel: null,
        sessionLabel: "OPEN",
        focusCount: 1,
        recentFocusCount: 0,
      },
      sinceLastVisit: {
        visible: false,
        newChangesCount: 0,
        newFocusCount: 0,
        newAlertsCount: 0,
        summaryLabel: "",
      },
      briefing: {
        story: {
          headline: "SELLING PRESSURE BROADENING\nACROSS 3 SECTORS",
          explanation: "Participation remains mixed.",
          tone: "negative",
          metrics: [],
        },
        state: { dimensions: [], overallLabel: "Selective Opportunity", overallTone: "warning" },
        moneyFlow: {
          inflows: [{ sector: "Jute", changeLabel: "+4.84%", strength: 100, tone: "positive" }],
          outflows: [],
        },
        opportunityScore: {
          score: 95,
          label: "Above Average Opportunity Environment",
          history: [48, 55, 95],
          previousSession: 55,
          weeklyAverage: 66,
          trendLabel: "Improving",
        },
        playbook: { question: "What should I do next?", items: [] },
        highPriority: null,
        leadership: {
          cards: [{ kind: "sector", title: "Strongest Sector", name: "Jute", detail: "+4.84%", subtitle: "Leading sector today · 3 advancing stocks", tone: "positive", href: null, sparklinePoints: [] }],
          freshBuySignals: [],
          narrative: "Leadership remains concentrated in Jute.",
          freshNewCount: 0,
          freshUpgradedCount: 0,
        },
        summary: {
          text: "Market remains selective.",
          tone: "warning",
          highlights: [],
          tradingEnvironment: {
            signals: [{ text: "Sector rotation active", tone: "positive" }],
            overallLabel: "Selective Opportunity",
            overallTone: "warning",
          },
        },
      },
      focusStocks: [{
        rank: 1,
        stockId: "1",
        symbol: "TEST",
        name: "Test Stock",
        exchange: "DSE",
        href: "/stocks/DSE/TEST",
        pulseScore: 95,
        scoreBreakdown: { trend: 20, momentum: 20, volume: 30, signalBoost: 6, riskPenalty: 0, total: 95, contributors: [], band: "High Attention" },
        focusLabel: "New BUY Setup",
        labelTone: "positive",
        whyHere: ["BUY setup at 77% confidence", "Volume 4.2x normal"],
        trigger: "Break above 198.90",
        actionSummary: "Volume expanding faster than price",
        latestPrice: "197.30",
        priceChangePercent: "+0.46%",
        priceTone: "positive",
        sparklinePoints: [1, 2],
      }],
      monitorCandidates: [],
      todayInsight: null,
      changes: [],
      alerts: [{
        id: "alert-volume",
        type: "unusual-volume",
        eventTitle: "Unusual Volume Detected",
        eventExplanation: "10.0x normal volume activity detected.",
        whyItMatters: "Institutional participation may be building.",
        metricLabel: "10.0x normal",
        significance: "HIGH",
        timeLabel: "3:00 PM",
        symbol: "TEST",
        latestPrice: "197.30",
        priceChangePercent: "+0.46%",
        priceTone: "positive",
        href: "/stocks/DSE/TEST",
      }],
      marketMovers: { gainers: [], losers: [] },
      emptyState: "none",
      emptyMessage: null,
      dataQualityNote: null,
      sessionDisablesRefresh: false,
      sessionDescription: "Open",
    } as unknown as MarketPulseModel;

    const localized = applyMarketPulseLocalization(model, "bn");
    expect(localized.hero.attentionSubline).toContain("বাজারে কী চলছে");
    expect(localized.briefing?.story.explanation).toContain("অংশগ্রহণ কম");
    expect(localized.focusStocks[0]?.whyHere[0]).toBe("BUY setup-এর confidence 77%");
    expect(localized.focusStocks[0]?.actionSummary).toBe("দামের চেয়ে Volume দ্রুত বাড়ছে");
    expect(localized.alerts[0]?.eventExplanation).toContain("Volume স্বাভাবিকের চেয়ে 10.0x");
    expect(localized.briefing?.summary.text).toContain("বাজার এখন");
    expect(localized.briefing?.story.headline).toBe("বিক্রির চাপ বাড়ছে\n3টি সেক্টরে");
  });

  it("localizes story headline variants by tone", () => {
    const language = getMarketPulseLanguage("bn");
    expect(language.briefing.storyHeadline("positive", 4)).toBe("কেনার আগ্রহ ছড়িয়ে পড়ছে\n4টি সেক্টরে");
    expect(language.briefing.storyHeadline("warning", 1)).toBe("মিশ্র বাজার, বেছে বেছে rotation");
  });
});
