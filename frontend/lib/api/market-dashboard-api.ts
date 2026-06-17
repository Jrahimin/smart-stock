import { backendApiGet } from "@/lib/api/backend-api-client";
import type {
  BackendDashboardMoversDto,
  BackendDashboardOverviewDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";

export function getDashboardOverview(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardOverviewDto>("/dashboard/overview", { exchange });
}

export function getDashboardMovers(exchange: ExchangeCode = "DSE") {
  return backendApiGet<BackendDashboardMoversDto>("/dashboard/movers", { exchange });
}
