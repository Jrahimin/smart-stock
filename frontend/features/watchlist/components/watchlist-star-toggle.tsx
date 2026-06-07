"use client";

import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";

import { useAuth } from "@/features/auth/context/auth-context";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { useWatchlistToggle } from "@/features/watchlist/hooks/use-watchlist-toggle";

type WatchlistStarToggleProps = {
  stockId: string;
  className?: string;
  stopPropagation?: boolean;
};

export function WatchlistStarToggle({ stockId, className = "", stopPropagation = false }: WatchlistStarToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { watchedStockIds } = useUserWatchlist();
  const toggleMutation = useWatchlistToggle();
  const isWatched = watchedStockIds.has(stockId);
  const tooltip = isWatched ? "Remove from Watchlist" : "Add to Watchlist";

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    toggleMutation.mutate(stockId);
  }

  return (
    <button
      type="button"
      className={`watchlist-icon-btn watchlist-star-toggle ${isWatched ? "is-watched" : ""} ${className}`.trim()}
      aria-label={tooltip}
      title={tooltip}
      aria-pressed={isWatched}
      disabled={toggleMutation.isPending}
      onClick={handleClick}
    >
      <Star size={15} fill={isWatched ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}
