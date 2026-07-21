"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useWatchlistItemRemove } from "@/features/watchlist/hooks/use-watchlist-item-remove";
import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";

type PortfolioMutationsContextValue = {
  update: ReturnType<typeof useWatchlistItemUpdate>;
  remove: ReturnType<typeof useWatchlistItemRemove>;
};

const PortfolioMutationsContext = createContext<PortfolioMutationsContextValue | null>(null);

export function PortfolioMutationsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const update = useWatchlistItemUpdate();
  const remove = useWatchlistItemRemove();

  return (
    <PortfolioMutationsContext.Provider value={{ update, remove }}>
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
