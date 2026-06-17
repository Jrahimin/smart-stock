import { formatCompactNumber, formatNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";
import type { BackendDashboardMoverDto, BackendDashboardMoversDto } from "@/lib/api/backend-api-types";
import type { MarketMoverModel } from "@/features/market-dashboard/types/market-dashboard-types";

function mapMoverTone(changePercent: number | null): MarketMoverModel["tone"] {
  if (changePercent === null || changePercent === 0) {
    return "neutral";
  }

  return changePercent > 0 ? "positive" : "negative";
}

function mapDashboardMover(mover: BackendDashboardMoverDto): MarketMoverModel {
  const changePercent = mover.price_change_percent === null ? null : toNumber(mover.price_change_percent);

  return {
    stockId: mover.stock_id,
    symbol: mover.symbol,
    name: mover.name,
    latestPrice: formatNumber(toNumber(mover.latest_price)),
    changePercent: formatPercent(changePercent),
    turnover: formatCompactNumber(mover.turnover === null ? null : toNumber(mover.turnover)),
    volume: formatCompactNumber(mover.volume),
    trend: mover.trend_direction,
    href: `/stocks/${mover.exchange}/${mover.symbol}`,
    tone: mapMoverTone(changePercent),
  };
}

export function mapDashboardMoversDto(dto: BackendDashboardMoversDto) {
  return {
    gainers: dto.gainers.map(mapDashboardMover),
    losers: dto.losers.map(mapDashboardMover),
    turnoverLeaders: dto.turnover_leaders.map(mapDashboardMover),
    volumeLeaders: dto.volume_leaders.map(mapDashboardMover),
  };
}
