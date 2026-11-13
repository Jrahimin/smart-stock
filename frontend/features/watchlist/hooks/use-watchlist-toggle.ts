"use client";
import { useAccountMutation } from "@/features/watchlist/hooks/use-account-mutation";
import { toggleWatchlistItem } from "@/lib/api/watchlist-api";

export function useWatchlistToggle() {
  return useAccountMutation("toggleWatchlistItem", (stockId: string) => toggleWatchlistItem(stockId));
}
