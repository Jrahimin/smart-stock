import type {
  DashboardLanguage,
  MarketMoodInsightKey,
  TurnoverInsightContext,
  TurnoverLiquidityInsightKey,
} from "@/features/market-dashboard/dashboard-language";
import type { MarketMood, MarketPulseModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { InsightBlockModel, InsightCategory } from "@/lib/insights/insight-types";

export type { MarketMoodInsightKey, TurnoverInsightContext, TurnoverLiquidityInsightKey };

export function resolveMarketMoodInsightKey(marketMood: MarketMood): MarketMoodInsightKey {
  switch (marketMood) {
    case "Accumulation":
      return "accumulation";
    case "Bullish":
      return "bullish";
    case "Bearish":
      return "bearish";
    case "High volatility":
      return "high_volatility";
    case "Weak recovery":
      return "weak_recovery";
    case "Cautious":
    default:
      return "cautious";
  }
}

export function buildTurnoverInsightContext(
  pulse: MarketPulseModel,
  liquidityKey: TurnoverLiquidityInsightKey,
): TurnoverInsightContext {
  return {
    turnoverLabel: pulse.turnoverLabel,
    vsYesterday: pulse.turnoverContext.vsYesterday,
    vs30DayAvg: pulse.turnoverContext.vs30DayAvg,
    liquidityKey,
  };
}

export function buildTurnoverInsightDescription(
  context: TurnoverInsightContext,
  copy: DashboardLanguage["insights"],
  narratives: DashboardLanguage["narratives"],
): string {
  if (context.turnoverLabel === "N/A") {
    return copy.blocks.turnoverContext.descriptionMissing;
  }

  const liquidityLabel = narratives[context.liquidityKey];
  const guidance = copy.blocks.turnoverContext.liquidityGuidance[context.liquidityKey];
  return copy.blocks.turnoverContext.descriptionAvailable(context, liquidityLabel, guidance);
}

function localizeInsightCategory(
  category: InsightCategory,
  categories: DashboardLanguage["insights"]["categories"],
): string {
  return categories[category] ?? category;
}

function localizeDashboardInsight(
  insight: InsightBlockModel,
  copy: DashboardLanguage["insights"],
  narratives: DashboardLanguage["narratives"],
  context: {
    marketMood: MarketMood;
    signalCount: number;
    turnover: TurnoverInsightContext;
  },
): InsightBlockModel {
  const categoryLabel = localizeInsightCategory(insight.category, copy.categories);

  switch (insight.id) {
    case "market-mood": {
      const moodKey = resolveMarketMoodInsightKey(context.marketMood);
      return {
        ...insight,
        title: copy.blocks.marketMood.title(moodKey),
        description: copy.blocks.marketMood.descriptions[moodKey],
        categoryLabel,
      };
    }
    case "signal-coverage":
      return {
        ...insight,
        title: copy.blocks.signalCoverage.title,
        description: copy.blocks.signalCoverage.description(context.signalCount),
        categoryLabel,
      };
    case "turnover-context":
      return {
        ...insight,
        title: copy.blocks.turnoverContext.title,
        description: buildTurnoverInsightDescription(context.turnover, copy, narratives),
        categoryLabel,
      };
    case "partial-data":
      return {
        ...insight,
        title: copy.blocks.partialData.title,
        description: copy.blocks.partialData.description,
        categoryLabel,
      };
    default:
      return { ...insight, categoryLabel };
  }
}

export function localizeDashboardInsights(
  insights: InsightBlockModel[],
  copy: DashboardLanguage["insights"],
  narratives: DashboardLanguage["narratives"],
  context: {
    marketMood: MarketMood;
    signalCount: number;
    turnover: TurnoverInsightContext;
  },
): InsightBlockModel[] {
  return insights.map((insight) => localizeDashboardInsight(insight, copy, narratives, context));
}

export function resolveTurnoverLiquidityInsightKey(
  ratio: number | null,
): TurnoverLiquidityInsightKey {
  if (ratio === null) {
    return "average_liquidity";
  }

  if (ratio >= 1.08) {
    return "strong_liquidity";
  }

  if (ratio <= 0.92) {
    return "weak_liquidity";
  }

  return "average_liquidity";
}
