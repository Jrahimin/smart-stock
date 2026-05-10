import type { InsightBlockModel } from "@/lib/insights/insight-types";

export type MarketInsightInput = {
  marketMood: "Bullish" | "Cautious" | "Bearish" | "Accumulation" | "Weak recovery" | "High volatility" | "Unknown";
  hasPartialData: boolean;
  signalCount: number;
  turnoverLabel: string;
};

export function buildMarketInsights(input: MarketInsightInput): InsightBlockModel[] {
  const insights: InsightBlockModel[] = [];

  if (input.marketMood !== "Unknown") {
    insights.push({
      id: "market-mood",
      title: `${input.marketMood} market tone`,
      description:
        input.marketMood === "Accumulation"
          ? "Positive breadth is pairing with stronger participation; prioritize liquid continuation setups."
          : input.marketMood === "Bullish"
          ? "Breadth and price action lean constructive for the latest available session."
          : input.marketMood === "Bearish"
            ? "Decliners are leading, so opportunity cards should be checked against risk first."
            : input.marketMood === "High volatility"
              ? "Volatility is elevated; position sizing and data quality checks matter more than headline direction."
              : input.marketMood === "Weak recovery"
                ? "The market is attempting to recover, but breadth confirmation is still weak."
                : "Market direction is mixed; confirmation matters more than headline movement.",
      tone:
        input.marketMood === "Bullish" || input.marketMood === "Accumulation"
          ? "positive"
          : input.marketMood === "Bearish" || input.marketMood === "High volatility"
            ? "negative"
            : input.marketMood === "Weak recovery" || input.marketMood === "Cautious"
              ? "warning"
              : "neutral",
      source: "DETERMINISTIC",
    });
  }

  if (input.signalCount > 0) {
    insights.push({
      id: "signal-coverage",
      title: "Signal layer ready",
      description: `${input.signalCount} highlighted signals can be explained with structured confidence and risk metadata.`,
      tone: "info",
      source: "DETERMINISTIC",
    });
  }

  insights.push({
    id: "turnover-context",
    title: "Turnover context",
    description: `Latest turnover is ${input.turnoverLabel}. Treat missing values as a data availability issue, not a zero-activity market.`,
    tone: input.turnoverLabel === "N/A" ? "warning" : "neutral",
    source: "DETERMINISTIC",
  });

  if (input.hasPartialData) {
    insights.push({
      id: "partial-data",
      title: "Data quality caution",
      description: "Some market fields are partial or validation-only, so the UI should avoid false precision.",
      tone: "warning",
      source: "DETERMINISTIC",
    });
  }

  return insights;
}
