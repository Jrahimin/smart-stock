"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { patchPortfolioWorkspace } from "@/features/watchlist/lib/patch-portfolio-workspace";
import type { BackendPortfolioWorkspaceDto } from "@/lib/api/backend-api-types";
import { updateWatchlistItem, type UpdateWatchlistItemPayload } from "@/lib/api/watchlist-api";

type PortfolioWorkspaceQueryKey = readonly ["portfolio", "workspace", string, string];

function portfolioPayloadNeedsRecalc(payload: UpdateWatchlistItemPayload) {
  return payload.is_holding !== undefined
    || payload.quantity !== undefined
    || payload.buy_price !== undefined;
}

export function useWatchlistItemUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stockId, payload }: { stockId: string; payload: UpdateWatchlistItemPayload }) =>
      updateWatchlistItem(stockId, payload),
    onMutate: async ({ stockId, payload }) => {
      await queryClient.cancelQueries({ queryKey: ["portfolio"] });

      const snapshots = queryClient.getQueriesData<BackendPortfolioWorkspaceDto>({
        queryKey: ["portfolio", "workspace"],
      });

      snapshots.forEach(([queryKey, data]) => {
        queryClient.setQueryData(
          queryKey as PortfolioWorkspaceQueryKey,
          patchPortfolioWorkspace(data, stockId, payload),
        );
      });

      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: (_data, _error, variables) => {
      if (variables && portfolioPayloadNeedsRecalc(variables.payload)) {
        void queryClient.invalidateQueries({
          queryKey: ["portfolio"],
          refetchType: "active",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}
