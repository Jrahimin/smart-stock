import { backendApiDelete, backendApiGet, backendApiPatch, backendApiPost } from "@/lib/api/backend-api-client";
import type {
  BackendUserWatchlistDto,
  BackendUserWatchlistSummaryDto,
  BackendUserWatchlistToggleResultDto,
} from "@/lib/api/backend-api-types";

const NO_STORE = { cache: "no-store" } as RequestInit;

export type ListWatchlistItemsParams = {
  holding_only?: boolean;
  limit?: number;
  offset?: number;
};

export type UpdateWatchlistItemPayload = {
  is_holding?: boolean;
  buy_price?: number | null;
  note?: string | null;
};

export function listWatchlistItems(params: ListWatchlistItemsParams = {}) {
  return backendApiGet<BackendUserWatchlistDto[]>(
    "/watchlist/items",
    {
      holding_only: params.holding_only ?? false,
      limit: params.limit ?? 500,
      offset: params.offset ?? 0,
    },
    NO_STORE,
  );
}

export function getWatchlistSummary() {
  return backendApiGet<BackendUserWatchlistSummaryDto>("/watchlist/summary", undefined, NO_STORE);
}

export function addWatchlistItem(stockId: string) {
  return backendApiPost<BackendUserWatchlistDto>("/watchlist/items", { stock_id: stockId });
}

export function updateWatchlistItem(stockId: string, payload: UpdateWatchlistItemPayload) {
  return backendApiPatch<BackendUserWatchlistDto>(`/watchlist/items/${stockId}`, payload);
}

export function removeWatchlistItem(stockId: string) {
  return backendApiDelete<{ stock_id: string }>(`/watchlist/items/${stockId}`);
}

export function toggleWatchlistItem(stockId: string) {
  return backendApiPost<BackendUserWatchlistToggleResultDto>(`/watchlist/items/${stockId}/toggle`);
}

export async function fetchWatchedStockIds() {
  const items = await listWatchlistItems({ limit: 500 });
  return new Set(items.map((item) => item.stock_id));
}
