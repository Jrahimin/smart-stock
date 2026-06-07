"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateWatchlistItem, type UpdateWatchlistItemPayload } from "@/lib/api/watchlist-api";

export function useWatchlistItemUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stockId, payload }: { stockId: string; payload: UpdateWatchlistItemPayload }) =>
      updateWatchlistItem(stockId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}
