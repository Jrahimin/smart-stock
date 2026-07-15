import type {
  BackendUserWatchlistDto,
  DecisionDisplayAction,
} from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel, TrendDirection } from "@/lib/market/market-intelligence-types";
import type { ResolvedTraderDecision } from "@/lib/market/trader-decision";

export type WatchlistFilterMode = "ALL" | "WATCHLISTED" | "NOT_WATCHLISTED" | "HOLDINGS";

export type WatchlistHoldingsFilter = "ALL" | "HOLDINGS_ONLY";

export type WatchlistActionFilter =
  | "ALL"
  | "POTENTIAL_BUY"
  | "HOLD"
  | "WAIT"
  | "SELL"
  | "NEW";

export type WatchlistTrendFilter = "ALL" | "BULLISH" | "BEARISH" | "SIDEWAYS";

export type WatchlistPageFilters = {
  holdings: WatchlistHoldingsFilter;
  action: WatchlistActionFilter;
  trend: WatchlistTrendFilter;
};

export type WatchlistTrendKey = "BULLISH" | "BEARISH" | "SIDEWAYS" | "UNKNOWN";

export type WatchlistRowViewModel = {
  item: BackendUserWatchlistDto;
  intelligence: StockIntelligenceModel | null;
  decision: ResolvedTraderDecision | null;
  companyName: string;
  buyPriceLabel: string | null;
  latestPriceLabel: string;
  changePercentLabel: string;
  rsiLabel: string;
  trendLabel: string;
  trendTone: "positive" | "negative" | "neutral";
  trendKey: WatchlistTrendKey;
  trendDirection: TrendDirection;
  actionLabel: DecisionDisplayAction;
  entryCondition: string | null;
  lastUpdatedLabel: string;
  unrealizedGainLabel: string | null;
  isNewSignal: boolean;
  previousActionLabel: DecisionDisplayAction | null;
};
