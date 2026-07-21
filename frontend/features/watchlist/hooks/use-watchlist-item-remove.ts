"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeWatchlistItem } from "@/lib/api/watchlist-api";

export function useWatchlistItemRemove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stockId: string) => removeWatchlistItem(stockId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
