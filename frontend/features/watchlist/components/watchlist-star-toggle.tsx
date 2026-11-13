"use client";

import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";

import type { AppLocale } from "@/lib/locale/app-locale";
import { useAuth } from "@/features/auth/context/auth-context";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { useWatchlistToggle } from "@/features/watchlist/hooks/use-watchlist-toggle";

type WatchlistStarToggleProps = {
  stockId: string;
  locale?: AppLocale;
  className?: string;
  stopPropagation?: boolean;
};

export function WatchlistStarToggle({ stockId, className = "", stopPropagation = false, locale = "en" }: WatchlistStarToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { watchedStockIds, isLoading: isWatchlistLoading } = useUserWatchlist();
  const toggleMutation = useWatchlistToggle();
  const isWatched = watchedStockIds.has(stockId);
  const tooltip = locale === "bn" ? (isWatched ? "ওয়াচলিস্ট থেকে সরান" : "ওয়াচলিস্টে যোগ করুন") : (isWatched ? "Remove from Watchlist" : "Add to Watchlist");
  const disabled = isAuthLoading || (isAuthenticated && isWatchlistLoading) || toggleMutation.isPending;

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
    <>
    <button
      type="button"
      className={`watchlist-icon-btn watchlist-star-toggle ${isWatched ? "is-watched" : ""} ${className}`.trim()}
      aria-label={tooltip}
      title={tooltip}
      aria-pressed={isWatched}
      disabled={disabled}
      onClick={handleClick}
    >
      <Star size={15} fill={isWatched ? "currentColor" : "none"} strokeWidth={2} />
    </button>
    {toggleMutation.isError && <span className="sr-only" role="alert">{locale === "bn" ? "ওয়াচলিস্ট বদলানো যায়নি। আবার চেষ্টা করুন।" : "Could not update watchlist. Try again."}</span>}
    </>
  );
}
