"use client";

import { Briefcase } from "lucide-react";

import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";

type WatchlistHoldingToggleProps = {
  stockId: string;
  isHolding: boolean;
  disabled?: boolean;
};

export function WatchlistHoldingToggle({ stockId, isHolding, disabled = false }: WatchlistHoldingToggleProps) {
  const updateMutation = useWatchlistItemUpdate();
  const tooltip = isHolding ? "Remove Holding" : "Mark as Holding";

  function handleClick() {
    const nextHolding = !isHolding;
    updateMutation.mutate({
      stockId,
      payload: nextHolding ? { is_holding: true } : { is_holding: false, buy_price: null },
    });
  }

  return (
    <button
      type="button"
      className={`watchlist-icon-btn watchlist-holding-toggle ${isHolding ? "is-active" : ""}`}
      aria-label={tooltip}
      title={tooltip}
      aria-pressed={isHolding}
      disabled={disabled || updateMutation.isPending}
      onClick={handleClick}
    >
      <Briefcase size={15} fill={isHolding ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}
