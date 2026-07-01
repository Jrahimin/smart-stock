import { backendApiGetFresh, backendApiGetMarket } from "@/lib/api/backend-api-client";
import type {
  BackendDashboardHeatmapDto,
  BackendDashboardMarketAlertsDto,
  BackendDashboardMarketSentimentDto,
  BackendDashboardMoversDto,
  BackendDashboardOverviewDto,
  BackendDashboardSectorsDto,
  BackendDashboardStocksInFocusDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";

export function getDashboardOverview(exchange: ExchangeCode = "DSE") {
  return backendApiGetFresh<BackendDashboardOverviewDto>("/dashboard/overview", { exchange });
}

export function getDashboardMovers(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDashboardMoversDto>("/dashboard/movers", { exchange });
}

export function getDashboardSectors(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDashboardSectorsDto>("/dashboard/sectors", { exchange });
}

export function getDashboardMarketAlerts(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDashboardMarketAlertsDto>("/dashboard/market-alerts", { exchange });
}

export function getDashboardStocksInFocus(exchange: ExchangeCode = "DSE") {
  return backendApiGetFresh<BackendDashboardStocksInFocusDto>("/dashboard/stocks-in-focus", { exchange });
}

export function getDashboardHeatmap(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDashboardHeatmapDto>("/dashboard/heatmap", { exchange });
}

export function getDashboardMarketSentiment(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDashboardMarketSentimentDto>("/dashboard/market-sentiment", { exchange });
}
