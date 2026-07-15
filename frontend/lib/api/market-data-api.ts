import { backendApiGetFresh, backendApiGetMarket } from "@/lib/api/backend-api-client";
import type {
  BackendDailyMarketSummaryDto,
  BackendDailyPriceDto,
  BackendDsexIndexSnapshotDto,
  BackendLatestMarketPriceDto,
  BackendMarketFreshnessDto,
  DataQualityFlag,
  ExchangeCode,
} from "@/lib/api/backend-api-types";

export type ListMarketSummariesParams = {
  limit?: number;
  offset?: number;
  exchange?: ExchangeCode;
};

export type ListDailyPricesParams = {
  limit?: number;
  offset?: number;
  start_date?: string;
  end_date?: string;
  source?: string;
  data_quality_flag?: DataQualityFlag;
};

export function getMarketFreshness(exchange: ExchangeCode = "DSE") {
  return backendApiGetFresh<BackendMarketFreshnessDto>("/market/freshness", { exchange });
}

export function getDsexIndexSnapshot(exchange: ExchangeCode = "DSE") {
  return backendApiGetMarket<BackendDsexIndexSnapshotDto>("/market/index/dsex", { exchange });
}

export function listMarketSummaries(params: ListMarketSummariesParams = {}) {
  return backendApiGetMarket<BackendDailyMarketSummaryDto[]>("/market/summaries", {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    exchange: params.exchange,
  });
}

export function listLatestMarketPrices(params: ListMarketSummariesParams = {}) {
  return backendApiGetMarket<BackendLatestMarketPriceDto[]>("/market/latest-prices", {
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    exchange: params.exchange,
  });
}

export function listDailyPrices(stockId: string, params: ListDailyPricesParams = {}) {
  return backendApiGetMarket<BackendDailyPriceDto[]>(`/stocks/${stockId}/prices`, {
    limit: params.limit ?? 180,
    offset: params.offset ?? 0,
    start_date: params.start_date,
    end_date: params.end_date,
    source: params.source,
    data_quality_flag: params.data_quality_flag,
  });
}
