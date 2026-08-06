import type {
  BackendPortfolioHoldingDto,
  BackendStockSearchResultDto,
  DataQualityFlag,
  MarketDataState,
  PortfolioPriceStatus,
} from "@/lib/api/backend-api-types";
import { parseDecimal } from "@/features/portfolio/view-models/portfolio-view-model";

export type AddHoldingMode = "create" | "edit" | "complete";

export type AddHoldingSelectedStock = {
  stockId: string;
  symbol: string;
  name: string;
  exchange: BackendPortfolioHoldingDto["exchange"];
  latestPrice: number | null;
  latestTradeDate: string | null;
  dataQualityFlag: DataQualityFlag | null;
  priceStatus: PortfolioPriceStatus;
};

export type AddHoldingPreview = {
  investedAmount: number | null;
  currentValue: number | null;
  unrealizedGainAmount: number | null;
  unrealizedGainPercent: number | null;
  priceStatus: PortfolioPriceStatus;
  canShowDailyMovement: boolean;
};

export type AddHoldingValidation = {
  stock: string | null;
  quantity: string | null;
  averageBuyPrice: string | null;
};

const RELIABLE_VALUE_STATUSES: ReadonlySet<PortfolioPriceStatus> = new Set([
  "FINALIZED",
  "PROVISIONAL",
  "NON_TRADED",
  "STALE_LAST_KNOWN",
]);

const DAILY_MOVEMENT_STATUSES: ReadonlySet<PortfolioPriceStatus> = new Set([
  "FINALIZED",
  "PROVISIONAL",
  "NON_TRADED",
]);

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parsePositiveDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveSearchPriceStatus(
  latestPrice: number | null,
  latestTradeDate: string | null,
  dataQualityFlag: DataQualityFlag | null,
  publishedMarketDate: string | null,
  dataState: MarketDataState | null,
): PortfolioPriceStatus {
  if (latestPrice == null || latestPrice <= 0) return "UNAVAILABLE";
  if (dataQualityFlag === "SUSPICIOUS") return "SUSPICIOUS";
  if (
    dataState === "STALE"
    || (publishedMarketDate != null
      && latestTradeDate != null
      && latestTradeDate !== publishedMarketDate)
  ) {
    return "STALE_LAST_KNOWN";
  }
  if (dataState === "LIVE" || dataState === "FINALIZATION_PENDING") return "PROVISIONAL";
  return "FINALIZED";
}

export function selectedStockFromSearchResult(
  stock: BackendStockSearchResultDto,
  publishedMarketDate: string | null,
  dataState: MarketDataState | null,
): AddHoldingSelectedStock {
  const latestPrice = parseDecimal(stock.latest_price);
  return {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    latestPrice,
    latestTradeDate: stock.latest_trade_date,
    dataQualityFlag: stock.data_quality_flag,
    priceStatus: resolveSearchPriceStatus(
      latestPrice,
      stock.latest_trade_date,
      stock.data_quality_flag,
      publishedMarketDate,
      dataState,
    ),
  };
}

export function selectedStockFromHolding(item: BackendPortfolioHoldingDto): AddHoldingSelectedStock {
  return {
    stockId: item.stock_id,
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    latestPrice: parseDecimal(item.current_price),
    latestTradeDate: item.latest_trade_date,
    dataQualityFlag: item.price_status === "SUSPICIOUS" ? "SUSPICIOUS" : null,
    priceStatus: item.price_status,
  };
}

export function buildAddHoldingPreview(
  quantity: number | null,
  averageBuyPrice: number | null,
  currentPrice: number | null,
  priceStatus: PortfolioPriceStatus,
): AddHoldingPreview {
  const investedAmount =
    quantity != null && averageBuyPrice != null
      ? roundMoney(quantity * averageBuyPrice)
      : null;

  const canUseCurrentValue =
    quantity != null
    && currentPrice != null
    && currentPrice > 0
    && RELIABLE_VALUE_STATUSES.has(priceStatus);

  const currentValue = canUseCurrentValue ? roundMoney(quantity * currentPrice) : null;

  const unrealizedGainAmount =
    investedAmount != null && currentValue != null
      ? roundMoney(currentValue - investedAmount)
      : null;

  const unrealizedGainPercent =
    unrealizedGainAmount != null && investedAmount != null && investedAmount > 0
      ? roundPercent((unrealizedGainAmount / investedAmount) * 100)
      : null;

  return {
    investedAmount,
    currentValue,
    unrealizedGainAmount,
    unrealizedGainPercent,
    priceStatus,
    canShowDailyMovement: DAILY_MOVEMENT_STATUSES.has(priceStatus),
  };
}

export function validateAddHoldingForm(input: {
  stockId: string | null;
  quantity: string;
  averageBuyPrice: string;
}): AddHoldingValidation {
  return {
    stock: input.stockId ? null : "required",
    quantity: parsePositiveDecimal(input.quantity) == null ? "required" : null,
    averageBuyPrice: parsePositiveDecimal(input.averageBuyPrice) == null ? "required" : null,
  };
}

export function isAddHoldingFormValid(validation: AddHoldingValidation) {
  return validation.stock == null
    && validation.quantity == null
    && validation.averageBuyPrice == null;
}

export function resolveExistingWatchlistState(
  items: BackendPortfolioHoldingDto[],
  stockId: string | null,
) {
  if (!stockId) return { existing: null as BackendPortfolioHoldingDto | null, isHolding: false, isWatched: false };
  const existing = items.find((item) => item.stock_id === stockId) ?? null;
  return {
    existing,
    isHolding: Boolean(existing?.is_holding),
    isWatched: existing != null,
  };
}
