import { backendApiGet } from "@/lib/api/backend-api-client";
import type {
  BackendStockDto,
  BackendStockSearchResultDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";
import { encodeStockSymbolSegment } from "@/lib/seo/stock-page-seo";

export type ListStocksParams = {
  limit?: number;
  offset?: number;
  exchange?: ExchangeCode;
  is_active?: boolean;
  search?: string;
};

export type ActiveStockSymbolDto = {
  exchange: ExchangeCode;
  symbol: string;
};

export function listStocks(params: ListStocksParams = {}) {
  return backendApiGet<BackendStockDto[]>("/stocks", {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    exchange: params.exchange,
    is_active: params.is_active,
    search: params.search,
  });
}

export function searchStocks(
  query: string,
  exchange?: ExchangeCode,
  limit = 20,
  options?: { includeQuotes?: boolean; signal?: AbortSignal },
) {
  return backendApiGet<BackendStockSearchResultDto[]>(
    "/stocks/search",
    {
      q: query,
      exchange,
      limit,
      offset: 0,
      is_active: true,
      include_quotes: options?.includeQuotes ?? false,
    },
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export function getStockByLookup(exchange: ExchangeCode, symbol: string) {
  return backendApiGet<BackendStockDto>(`/stocks/lookup/${exchange}/${encodeStockSymbolSegment(symbol)}`);
}
