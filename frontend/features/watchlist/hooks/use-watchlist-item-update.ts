"use client";
import { useAccountMutation } from "@/features/watchlist/hooks/use-account-mutation";
import { updateWatchlistItem, type UpdateWatchlistItemPayload } from "@/lib/api/watchlist-api";

export function useWatchlistItemUpdate() {
  return useAccountMutation("updateWatchlistItem", ({ stockId, payload }: { stockId: string; payload: UpdateWatchlistItemPayload }) => updateWatchlistItem(stockId, payload));
}
