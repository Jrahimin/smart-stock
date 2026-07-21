"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { toggleWatchlistItem } from "@/lib/api/watchlist-api";

export function useWatchlistToggle() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";

  return useMutation({
    mutationFn: (stockId: string) => toggleWatchlistItem(stockId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onMutate: async (stockId) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist", "items", userId] });
      const previousItems = queryClient.getQueryData<Awaited<ReturnType<typeof import("@/lib/api/watchlist-api").listWatchlistItems>>>(
        ["watchlist", "items", userId],
      );

      if (previousItems) {
        const exists = previousItems.some((item) => item.stock_id === stockId);
        queryClient.setQueryData(
          ["watchlist", "items", userId],
          exists
            ? previousItems.filter((item) => item.stock_id !== stockId)
            : [
                ...previousItems,
                {
                  id: `optimistic-${stockId}`,
                  user_id: userId,
                  stock_id: stockId,
                  stock_symbol: "",
                  is_holding: false,
                  quantity: null,
                  buy_price: null,
                  note: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  unrealized_gain_percent: null,
                  has_note: false,
                  watching_days: 0,
                  watching_label: "Added today",
                  current_price: null,
                  trader_decision: null,
                },
              ],
        );
      }

      return { previousItems };
    },
    onError: (_error, _stockId, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(["watchlist", "items", userId], context.previousItems);
      }
    },
  });
}
