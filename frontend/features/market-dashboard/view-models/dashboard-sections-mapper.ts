import { formatCompactNumber, formatNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";
import type {
  BackendDashboardHeatmapDto,
  BackendDashboardMarketAlertsDto,
  BackendDashboardMarketSentimentDto,
  BackendDashboardSectorsDto,
  BackendDashboardStocksInFocusDto,
  BackendScoredUniverseRowDto,
  BackendStockTraderDecisionDto,
} from "@/lib/api/backend-api-types";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import type { LeadersPulseContext } from "@/lib/market/market-pulse-metrics";
import { compareCanonicalShortlist, isActionableDecision } from "@/lib/market/trader-decision";
import {
  buildDecisionSupportingContext,
  resolveTraderDecision,
} from "@/lib/market/trader-decision";
import {
  buildSignalTechnicalContext,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";
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

function buildSignalFeedReason(stock: ReturnType<typeof mapUniverseRowToListRow>): string {
  const decision = resolveTraderDecision(stock);
  const stockSpecific = buildDecisionSupportingContext(stock).slice(0, 2).join(" · ");
  const actionReason =
    decision.recommendation === "POTENTIAL_BUY" && decision.entryCondition
      ? decision.entryCondition
      : decision.reason;
  return stockSpecific ? `${stockSpecific}. ${actionReason}` : actionReason;
}

function compareSignalFeedCandidates(
  left: ReturnType<typeof mapUniverseRowToListRow>,
  right: ReturnType<typeof mapUniverseRowToListRow>,
): number {
  return compareCanonicalShortlist(left, right);
}

export function mapUniverseRowsToSignalFeed(
  rows: BackendScoredUniverseRowDto[],
  limit = DASHBOARD_SIGNAL_FEED_LIMIT,
): SignalFeedItemModel[] {
  return rows
    .map((row) => mapUniverseRowToListRow(row))
    .filter((stock) => {
      const decision = resolveTraderDecision(stock);
      return decision.source === "decision-engine";
    })
    .sort(compareSignalFeedCandidates)
    .slice(0, limit)
    .map((stock) => {
      const decision = resolveTraderDecision(stock);
      const supportingContext = buildDecisionSupportingContext(stock);
      const resolvedReason = resolveTraderDecisionReason(
        decision.reason,
        decision.reasonCode,
      );

      return {
        symbol: stock.stock.symbol,
        decisionSummary: stock.traderDecision,
        signal: decision.recommendation,
        confidence: decision.evidenceStatus ?? "UNAVAILABLE",
        confidenceValue: decision.confidence,
        reason: buildSignalFeedReason(stock),
        reasonSummary: decision.reason,
        reasonKey: resolvedReason.key,
        reasonCode: decision.reasonCode,
        reasonParams: resolvedReason.params,
        entryCondition: decision.entryCondition,
        entryApplicability: decision.entryApplicability,
        technicalContext: buildSignalTechnicalContext(stock),
        risk: decision.riskLabel,
        priority: "low",
        href: buildStockDetailPath(stock.stock.exchange, stock.stock.symbol),
        supportingContext: supportingContext.length
          ? supportingContext
          : [
              decision.opportunityScore !== null ? `Opportunity ${decision.opportunityScore}` : "Opportunity —",
              `${decision.riskLabel} risk`,
            ],
        generatedAt: formatGeneratedAt(stock.latestTradeDate),
      };
    });
}

export function mapTraderDecisionsToSignalFeed(
  decisions: BackendStockTraderDecisionDto[],
  limit = DASHBOARD_SIGNAL_FEED_LIMIT,
): SignalFeedItemModel[] {
  const ranked = decisions
    .filter(
      ({ decision }) =>
        isActionableDecision(
          decision.display_action ??
            (decision.recommendation === "SELL" ? "SELL" : "WAIT"),
        ) || decision.evidence_status === "MIXED",
    )
    .sort((left, right) => (left.shortlist?.entry_rank ?? 9999) - (right.shortlist?.entry_rank ?? 9999) || left.stock.symbol.localeCompare(right.stock.symbol))
    .slice(0, limit);

  return ranked.map(({ stock, decision, latest_trade_date }) => {
    const resolvedReason = resolveTraderDecisionReason(
      decision.reason,
      decision.primary_reason_code,
    );
    const displayAction =
      decision.display_action ??
      (decision.recommendation === "SELL" ? "SELL" : "WAIT");

    return {
      symbol: stock.symbol,
      signal: displayAction,
      confidence: decision.evidence_status ?? "UNAVAILABLE",
      confidenceValue: decision.confidence,
      reason:
        displayAction === "POTENTIAL_BUY" && decision.entry_condition
          ? decision.entry_condition
          : decision.reason,
      reasonSummary: decision.reason,
      reasonKey: resolvedReason.key,
      reasonCode: decision.primary_reason_code ?? null,
      reasonParams: resolvedReason.params,
      entryCondition: decision.entry_condition ?? null,
      entryApplicability: decision.entry_applicability,
      technicalContext: {},
      risk: decision.risk_label,
      priority: "low",
      href: buildStockDetailPath(stock.exchange, stock.symbol),
      supportingContext: [`Opportunity ${decision.opportunity_score}`, `${decision.risk_label} risk`],
      generatedAt: formatGeneratedAt(latest_trade_date),
    };
  });
}

export function mapDashboardSignalsDto(dto: BackendDashboardStocksInFocusDto): SignalFeedItemModel[] {
  return dto.signals.map((signal) => {
    const resolvedReason = resolveTraderDecisionReason(
      signal.reason,
      signal.primary_reason_code,
    );

    return {
      symbol: signal.symbol,
      signal: signal.signal,
      confidence: "UNAVAILABLE",
      confidenceValue: 0,
      reason:
        signal.signal === "POTENTIAL_BUY" && signal.entry_condition
          ? signal.entry_condition
          : signal.reason,
      reasonSummary: signal.reason,
      reasonKey: resolvedReason.key,
      reasonCode: signal.primary_reason_code ?? null,
      reasonParams: resolvedReason.params,
      entryCondition: signal.entry_condition ?? null,
      technicalContext: {},
      risk: signal.risk,
      priority: signal.priority as SignalFeedItemModel["priority"],
      href: buildStockDetailPath(signal.exchange, signal.symbol),
      supportingContext: signal.supporting_context,
      generatedAt: signal.generated_at,
    };
  });
}

export function mapDashboardAlertsDto(dto: BackendDashboardMarketAlertsDto): MarketTimelineItemModel[] {
  return dto.items.filter(item => !["Market snapshot ready", "Market scan complete", "Generated snapshot update"].includes(item.title)).map((item) => ({
    kind: item.title === "Market snapshot ready" || item.title === "Market scan complete" ? "snapshot"
      : /^Top session mover in the latest snapshot/.test(item.description) ? "mover" : "alert",
    sourceUrl: item.source_url && /^https?:\/\//i.test(item.source_url) ? item.source_url : undefined,
    time: /^\d{4}-\d{2}-\d{2}/.test(item.time) ? item.time : dto.session_trade_date ?? item.time,
    title: item.title,
    description: item.description,
  }));
}

export function mapDashboardHeatmapDto(dto: BackendDashboardHeatmapDto): HeatmapTileModel[] {
  const sectors = new Map(dto.sectors?.map((sector) => [sector.name, sector]));
  return dto.tiles.map((tile) => {
    const changePercent = tile.trade_date && tile.trade_date === dto.session_trade_date ? toNumber(tile.change_percent) : null;
    const sector = sectors.get(tile.sector);
    return {
      stockId: tile.stock_id,
      symbol: tile.symbol,
      label: tile.symbol,
      sector: tile.sector,
      value: formatPercent(changePercent),
      changePercent,
      tradeDate: tile.trade_date,
      sectorSummary: sector ? { changePercent: toNumber(sector.change_percent), measuredCount: sector.measured_count,
        totalCount: sector.total_count, weighting: sector.weighting } : undefined,
      weight: toNumber(tile.weight) ?? 1,
      tone: changePercent === null ? "neutral" : tile.tone as HeatmapTileModel["tone"],
      href: `/stocks/DSE/${tile.symbol}`,
      latestPrice: formatNumber(toNumber(tile.latest_price)),
      turnover: formatCompactNumber(toNumber(tile.turnover)),
      turnoverValue: toNumber(tile.turnover_value) ?? 0,
      liquidityScore: tile.liquidity_score,
    };
  });
}

export function mapDashboardSentimentDto(dto: BackendDashboardMarketSentimentDto): {
  marketSyncId: string | null;
  marketMood: MarketMood;
  insights: InsightBlockModel[];
  signalCount: number;
  priceBackedCount: number;
  turnoverLabel: string;
} {
  return {
    marketSyncId: dto.market_sync_id ?? null,
    marketMood: "Unknown",
    insights: [...(dto.interpretation ? [{ id: "market-mood", title: "Session interpretation", description: "", tone: dto.interpretation.code === "ALIGNED_UP" ? "positive" : dto.interpretation.code === "ALIGNED_DOWN" ? "negative" : "neutral", category: "momentum", source: "DETERMINISTIC", interpretation: dto.interpretation }] : []), ...dto.insights.filter((insight) => insight.id !== "market-mood")].map((insight) => ({
      interpretation: "interpretation" in insight ? insight.interpretation : undefined,
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
  const sectors = dto.sectors.filter((sector) => toNumber(sector.change_percent) !== null);
  const primary = sectors[0]
    ? {
        name: sectors[0].name,
        changePercent: toNumber(sectors[0].change_percent) ?? 0,
        label: `${sectors[0].name} ${formatPercent(toNumber(sectors[0].change_percent))}`,
      }
    : null;
  const runnerUp = sectors[1]
    ? {
        name: sectors[1].name,
        changePercent: toNumber(sectors[1].change_percent) ?? 0,
        label: `${sectors[1].name} ${formatPercent(toNumber(sectors[1].change_percent))}`,
      }
    : null;

  const rows: LeadersPulseContext["rows"] = [];
  if (primary) {
    rows.push({
      kind: "top_sector",
      label: "Top Sector",
      name: primary.name,
      performanceBadge: formatPercent(primary.changePercent),
      performanceTone: primary.changePercent > 0 ? "positive" : primary.changePercent < 0 ? "negative" : "neutral",
    });
  }
  if (runnerUp) {
    rows.push({
      kind: "runner_up",
      label: "Runner-up",
      name: runnerUp.name,
      performanceBadge: formatPercent(runnerUp.changePercent),
      performanceTone: runnerUp.changePercent > 0 ? "positive" : runnerUp.changePercent < 0 ? "negative" : "neutral",
    });
  }
  if (dto.top_gainer && toNumber(dto.top_gainer.change_percent) !== null) {
    const change = toNumber(dto.top_gainer.change_percent) ?? 0;
    rows.push({
      kind: "top_stock",
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
