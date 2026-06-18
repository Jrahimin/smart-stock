import type { ExchangeCode } from "@/lib/api/backend-api-types";
import {
  filterSectorPeers,
  filterSimilarSetup,
  filterSimilarSize,
  filterTopOpportunities,
  type RelatedStocksGroupId,
} from "@/lib/market/related-stocks";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import { resolveTraderDecision } from "@/lib/market/trader-decision";

export type RelatedStockCard = {
  stockId: string;
  symbol: string;
  exchange: ExchangeCode;
  href: string;
  price: string;
  changePercent: string;
  recommendation: string;
};

export type RelatedStocksGroup = {
  id: RelatedStocksGroupId;
  title: string;
  items: RelatedStockCard[];
};

export type RelatedStocksCta = {
  label: string;
  href: string;
};

function mapStockToCard(stock: StockIntelligenceModel): RelatedStockCard {
  const decision = resolveTraderDecision(stock);

  return {
    stockId: stock.stock.id,
    symbol: stock.stock.symbol,
    exchange: stock.stock.exchange,
    href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
    price: formatNumber(stock.latestPrice),
    changePercent: formatPercent(stock.priceChangePercent),
    recommendation: decision.recommendation,
  };
}

export function buildRelatedStocksGroups(
  current: StockIntelligenceModel,
  universe: StockIntelligenceModel[],
): RelatedStocksGroup[] {
  return [
    {
      id: "sector-peers",
      title: "Sector Peers",
      items: filterSectorPeers(current, universe).map(mapStockToCard),
    },
    {
      id: "similar-setup",
      title: "Similar Setup",
      items: filterSimilarSetup(current, universe).map(mapStockToCard),
    },
    {
      id: "similar-size",
      title: "Similar Size",
      items: filterSimilarSize(current, universe).map(mapStockToCard),
    },
    {
      id: "top-opportunities",
      title: "Top Opportunities",
      items: filterTopOpportunities(current, universe).map(mapStockToCard),
    },
  ];
}

export function resolveRelatedStocksCta(sector: string, groups: RelatedStocksGroup[]): RelatedStocksCta {
  const sectorPeers = groups.find((group) => group.id === "sector-peers");
  const normalizedSector = sector.trim();

  if (sectorPeers?.items.length && normalizedSector && normalizedSector !== "Unclassified") {
    return {
      label: `Browse ${normalizedSector} peers`,
      href: `/stocks?search=${encodeURIComponent(normalizedSector)}`,
    };
  }

  return {
    label: "Explore more in Scanner",
    href: "/scanner",
  };
}

export function hasRelatedStockResults(groups: RelatedStocksGroup[]) {
  return groups.some((group) => group.items.length > 0);
}
