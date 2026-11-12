"use client";

import { useMutationState } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/context/auth-context";
import { createContext, useContext, type ReactNode } from "react";

import { useWatchlistItemRemove } from "@/features/watchlist/hooks/use-watchlist-item-remove";
import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";

type PortfolioMutationsContextValue = {
  update: ReturnType<typeof useWatchlistItemUpdate>;
  remove: ReturnType<typeof useWatchlistItemRemove>;
  pendingStockIds: Set<string>;
};

const PortfolioMutationsContext = createContext<PortfolioMutationsContextValue | null>(null);

export function PortfolioMutationsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const pending = useMutationState({
    filters: { mutationKey: ["account-watchlist", user?.id ?? "anonymous"], status: "pending" },
    select: (mutation) => {
      const value = (mutation.state.variables as { input?: unknown } | undefined)?.input;
      return typeof value === "string" ? value : (value as { stockId?: string } | undefined)?.stockId;
    },
  });
  const pendingStockIds = new Set(pending.filter((value): value is string => Boolean(value)));
  const update = useWatchlistItemUpdate();
  const remove = useWatchlistItemRemove();

  return (
    <PortfolioMutationsContext.Provider value={{ update, remove, pendingStockIds }}>
      {children}
    </PortfolioMutationsContext.Provider>
  );
}

export function usePortfolioMutations() {
  const value = useContext(PortfolioMutationsContext);
  if (!value) {
    throw new Error("usePortfolioMutations must be used within PortfolioMutationsProvider");
  }
  return value;
}
