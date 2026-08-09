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

export function getDashboardMovers(exchange: ExchangeCode = "DSE", generation?: string) {
  return backendApiGetMarket<BackendDashboardMoversDto>("/dashboard/movers", { exchange }, undefined, generation);
}

export function getDashboardSectors(exchange: ExchangeCode = "DSE", generation?: string) {
  return backendApiGetMarket<BackendDashboardSectorsDto>("/dashboard/sectors", { exchange }, undefined, generation);
}

export function getDashboardMarketAlerts(exchange: ExchangeCode = "DSE", generation?: string) {
  return backendApiGetMarket<BackendDashboardMarketAlertsDto>("/dashboard/market-alerts", { exchange }, undefined, generation);
}

export function getDashboardStocksInFocus(exchange: ExchangeCode = "DSE") {
  return backendApiGetFresh<BackendDashboardStocksInFocusDto>("/dashboard/stocks-in-focus", { exchange });
}

export function getDashboardHeatmap(exchange: ExchangeCode = "DSE", generation?: string) {
  return backendApiGetMarket<BackendDashboardHeatmapDto>("/dashboard/heatmap", { exchange }, undefined, generation);
}

export function getDashboardMarketSentiment(exchange: ExchangeCode = "DSE", generation?: string) {
  return backendApiGetMarket<BackendDashboardMarketSentimentDto>("/dashboard/market-sentiment", { exchange }, undefined, generation);
}
