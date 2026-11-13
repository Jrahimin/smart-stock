"use client";
import { useAccountMutation } from "@/features/watchlist/hooks/use-account-mutation";
import { removeWatchlistItem } from "@/lib/api/watchlist-api";

export function useWatchlistItemRemove() {
  return useAccountMutation("removeWatchlistItem", (stockId: string) => removeWatchlistItem(stockId));
}
