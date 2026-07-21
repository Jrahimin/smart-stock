import type { BackendPortfolioHoldingDto, BackendPortfolioWorkspaceDto } from "@/lib/api/backend-api-types";
import type { UpdateWatchlistItemPayload } from "@/lib/api/watchlist-api";

function patchHolding(
  item: BackendPortfolioHoldingDto,
  stockId: string,
  payload: UpdateWatchlistItemPayload,
): BackendPortfolioHoldingDto {
  if (item.stock_id !== stockId) return item;

  return {
    ...item,
    ...(payload.is_holding !== undefined ? { is_holding: payload.is_holding } : {}),
    ...(payload.quantity !== undefined
      ? { quantity: payload.quantity == null ? null : String(payload.quantity) }
      : {}),
    ...(payload.buy_price !== undefined
      ? { average_buy_price: payload.buy_price == null ? null : String(payload.buy_price) }
      : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
  };
}

export function patchPortfolioWorkspace(
  workspace: BackendPortfolioWorkspaceDto | undefined,
  stockId: string,
  payload: UpdateWatchlistItemPayload,
): BackendPortfolioWorkspaceDto | undefined {
  if (!workspace) return workspace;

  const mapItems = (items: BackendPortfolioHoldingDto[]) =>
    items.map((item) => patchHolding(item, stockId, payload));

  return {
    ...workspace,
    watchlist_items: mapItems(workspace.watchlist_items),
    holdings: mapItems(workspace.holdings),
  };
}
