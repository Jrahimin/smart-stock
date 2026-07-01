import { formatCompactNumber, formatNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";
import type {
  BackendDashboardHeatmapDto,
  BackendDashboardMarketAlertsDto,
  BackendDashboardMarketSentimentDto,
  BackendDashboardSectorsDto,
  BackendDashboardStocksInFocusDto,
  BackendStockTraderDecisionDto,
} from "@/lib/api/backend-api-types";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import type { LeadersPulseContext } from "@/lib/market/market-pulse-metrics";
import { isActionableDecision } from "@/lib/market/trader-decision";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";
import type {
  HeatmapTileModel,
  MarketMood,
  MarketTimelineItemModel,
  SignalFeedItemModel,
} from "@/features/market-dashboard/types/market-dashboard-types";

const DASHBOARD_SIGNAL_FEED_LIMIT = 8;

function decisionPriority(confidence: number): SignalFeedItemModel["priority"] {
  if (confidence >= 70) {
    return "high";
  }
  if (confidence >= 58) {
    return "medium";
  }
  return "low";
}

function formatGeneratedAt(latestTradeDate: string | null): string {
  return latestTradeDate ?? "Awaiting price data";
}

export function mapTraderDecisionsToSignalFeed(
  decisions: BackendStockTraderDecisionDto[],
  limit = DASHBOARD_SIGNAL_FEED_LIMIT,
): SignalFeedItemModel[] {
  const ranked = decisions
    .filter(
      ({ decision }) =>
        isActionableDecision(decision.recommendation) || decision.confidence >= 55,
    )
    .sort((left, right) => right.decision.confidence - left.decision.confidence)
    .slice(0, limit);

  return ranked.map(({ stock, decision, latest_trade_date }) => ({
    symbol: stock.symbol,
    signal: decision.recommendation,
    confidence: `${decision.confidence}%`,
    confidenceValue: decision.confidence,
    reason: decision.reason,
    risk: decision.risk_label,
    priority: decisionPriority(decision.confidence),
    href: buildStockDetailPath(stock.exchange, stock.symbol),
    supportingContext: [`Opportunity ${decision.opportunity_score}`, `${decision.risk_label} risk`],
    generatedAt: formatGeneratedAt(latest_trade_date),
  }));
}

export function mapDashboardSignalsDto(dto: BackendDashboardStocksInFocusDto): SignalFeedItemModel[] {
  return dto.signals.map((signal) => ({
    symbol: signal.symbol,
    signal: signal.signal,
    confidence: `${signal.confidence}%`,
    confidenceValue: signal.confidence,
    reason: signal.reason,
    risk: signal.risk,
    priority: signal.priority as SignalFeedItemModel["priority"],
    href: buildStockDetailPath(signal.exchange, signal.symbol),
    supportingContext: signal.supporting_context,
    generatedAt: signal.generated_at,
  }));
}

export function mapDashboardAlertsDto(dto: BackendDashboardMarketAlertsDto): MarketTimelineItemModel[] {
  return dto.items.map((item) => ({
    time: item.time,
    title: item.title,
    description: item.description,
  }));
}

export function mapDashboardHeatmapDto(dto: BackendDashboardHeatmapDto): HeatmapTileModel[] {
  return dto.tiles.map((tile) => {
    const changePercent = toNumber(tile.change_percent) ?? 0;
    return {
      stockId: tile.stock_id,
      symbol: tile.symbol,
      label: tile.symbol,
      sector: tile.sector,
      value: formatPercent(changePercent),
      changePercent,
      weight: toNumber(tile.weight) ?? 1,
      tone: tile.tone as HeatmapTileModel["tone"],
      href: `/stocks/DSE/${tile.symbol}`,
      latestPrice: formatNumber(toNumber(tile.latest_price)),
      turnover: formatCompactNumber(toNumber(tile.turnover)),
      turnoverValue: toNumber(tile.turnover_value) ?? 0,
      liquidityScore: tile.liquidity_score,
    };
  });
}

export function mapDashboardSentimentDto(dto: BackendDashboardMarketSentimentDto): {
  marketMood: MarketMood;
  insights: InsightBlockModel[];
  signalCount: number;
  priceBackedCount: number;
  turnoverLabel: string;
} {
  return {
    marketMood: dto.market_mood as MarketMood,
    insights: dto.insights.map((insight) => ({
      id: insight.id,
      title: insight.title,
      description: insight.description,
      tone: insight.tone as InsightBlockModel["tone"],
      category: insight.category as InsightBlockModel["category"],
      source: insight.source as InsightBlockModel["source"],
    })),
    signalCount: dto.signal_count,
    priceBackedCount: dto.price_backed_count,
    turnoverLabel: dto.turnover_value === null ? "N/A" : formatCompactNumber(toNumber(dto.turnover_value)),
  };
}

export function mapDashboardSectorsToLeadersContext(dto: BackendDashboardSectorsDto): LeadersPulseContext {
  const primary = dto.sectors[0]
    ? {
        name: dto.sectors[0].name,
        changePercent: toNumber(dto.sectors[0].change_percent) ?? 0,
        label: `${dto.sectors[0].name} ${formatPercent(toNumber(dto.sectors[0].change_percent))}`,
      }
    : null;
  const runnerUp = dto.sectors[1]
    ? {
        name: dto.sectors[1].name,
        changePercent: toNumber(dto.sectors[1].change_percent) ?? 0,
        label: `${dto.sectors[1].name} ${formatPercent(toNumber(dto.sectors[1].change_percent))}`,
      }
    : null;

  const rows: LeadersPulseContext["rows"] = [];
  if (primary) {
    rows.push({
      label: "Top Sector",
      name: primary.name,
      performanceBadge: formatPercent(primary.changePercent),
      performanceTone: primary.changePercent > 0 ? "positive" : primary.changePercent < 0 ? "negative" : "neutral",
    });
  }
  if (runnerUp) {
    rows.push({
      label: "Runner-up",
      name: runnerUp.name,
      performanceBadge: formatPercent(runnerUp.changePercent),
      performanceTone: runnerUp.changePercent > 0 ? "positive" : runnerUp.changePercent < 0 ? "negative" : "neutral",
    });
  }
  if (dto.top_gainer) {
    const change = toNumber(dto.top_gainer.change_percent) ?? 0;
    rows.push({
      label: "Top Stock",
      name: dto.top_gainer.symbol,
      performanceBadge: formatPercent(change),
      performanceTone: change > 0 ? "positive" : change < 0 ? "negative" : "neutral",
    });
  }

  return {
    rows,
    footer: dto.sectors.length ? `${dto.sectors.length} sectors with session participation` : "Awaiting sector participation",
    primary,
  };
}
