import { backendApiGet } from "@/lib/api/backend-api-client";
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
  return backendApiGet<BackendDashboardOverviewDto>("/dashboard/overview", { exchange });
}

export function getDashboardMovers(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardMoversDto>("/dashboard/movers", { exchange });
}

export function getDashboardSectors(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardSectorsDto>("/dashboard/sectors", { exchange });
}

export function getDashboardMarketAlerts(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardMarketAlertsDto>("/dashboard/market-alerts", { exchange });
}

export function getDashboardStocksInFocus(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardStocksInFocusDto>("/dashboard/stocks-in-focus", { exchange });
}

export function getDashboardHeatmap(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardHeatmapDto>("/dashboard/heatmap", { exchange });
}

export function getDashboardMarketSentiment(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardMarketSentimentDto>("/dashboard/market-sentiment", { exchange });
}
