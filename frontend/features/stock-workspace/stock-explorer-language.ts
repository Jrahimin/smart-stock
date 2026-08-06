import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type StockExplorerLanguage = {
  hero: {
    eyebrow: string;
    title: string;
    loadingSubtitle: string;
    readySubtitle: (args: {
      filteredCount: number;
      listedStockCount: number;
      loadedPriceCount: number;
      visibleCount: number;
      isTableFiltered: boolean;
    }) => string;
  };
  search: {
    globalPlaceholder: string;
    globalAriaLabel: string;
    tablePlaceholder: string;
    tableAriaLabel: string;
    clearTableSearchAria: string;
  };
  filters: {
    toolbarAria: string;
    allActions: string;
    allVolume: string;
    volumeExpansion: string;
    volumeNormal: string;
    volumeThin: string;
    portfolioScopeAria: string;
    watchlist: string;
    holdings: string;
    reset: string;
  };
  columns: {
    symbol: string;
    price: string;
    change: string;
    turnover: string;
    volume: string;
    rsi: string;
    action: string;
    evidence: string;
    sector: string;
    category: string;
  };
  states: {
    warmingUp: string;
    loadError: string;
    loadingMore: string;
    scrollForMore: string;
    emptyWatchlistTitle: string;
    emptyWatchlistBody: string;
    emptyHoldingsTitle: string;
    emptyHoldingsBody: string;
    emptySearchTitle: (query: string) => string;
    emptySearchBody: string;
    emptyFiltersTitle: string;
    emptyFiltersBody: string;
    resetFiltersAction: string;
  };
  localeSwitcherAria: string;
};

const stockExplorerLanguage = {
  en: {
    hero: {
      eyebrow: "Stock Explorer",
      title: "High-speed stock discovery",
      loadingSubtitle: "Loading price-backed instruments…",
      readySubtitle: ({
        filteredCount,
        listedStockCount,
        loadedPriceCount,
        visibleCount,
        isTableFiltered,
      }) =>
        isTableFiltered
          ? `Showing ${filteredCount} of ${loadedPriceCount} session-backed stocks (${listedStockCount} listed).`
          : `${filteredCount} price-backed instruments from ${listedStockCount} listed stocks (${loadedPriceCount} with session data). Showing ${visibleCount}.`,
    },
    search: {
      globalPlaceholder: "Search any stock…",
      globalAriaLabel: "Global stock search",
      tablePlaceholder: "Filter symbol or company…",
      tableAriaLabel: "Filter Explorer table",
      clearTableSearchAria: "Clear table filter",
    },
    filters: {
      toolbarAria: "Explorer table filters",
      allActions: "All actions",
      allVolume: "All volume",
      volumeExpansion: "Volume expansion",
      volumeNormal: "Normal volume",
      volumeThin: "Thin volume",
      portfolioScopeAria: "Portfolio scope",
      watchlist: "Watchlist",
      holdings: "Holdings",
      reset: "Reset",
    },
    columns: {
      symbol: "Symbol",
      price: "Price",
      change: "% Change",
      turnover: "Turnover",
      volume: "Volume",
      rsi: "RSI",
      action: "Action",
      evidence: "Evidence",
      sector: "Sector",
      category: "Cat.",
    },
    states: {
      warmingUp: "Market view is warming up.",
      loadError: "Could not load stock explorer data.",
      loadingMore: "Loading more rows...",
      scrollForMore: "Scroll down to load more rows",
      emptyWatchlistTitle: "No watchlist matches",
      emptyWatchlistBody:
        "Star stocks from the explorer to build your watchlist, or turn off the Watchlist filter to browse everything.",
      emptyHoldingsTitle: "No holdings match",
      emptyHoldingsBody:
        "Linked portfolio holdings will appear here. Turn off the Holdings filter to browse the full universe.",
      emptySearchTitle: (query) => `No Explorer rows match ‘${query}’.`,
      emptySearchBody: "Clear the table filter or reset Action, Volume, Watchlist, and Holdings filters.",
      emptyFiltersTitle: "No stocks match these filters",
      emptyFiltersBody: "Adjust the action or volume filters to widen the result set.",
      resetFiltersAction: "Reset table filters",
    },
    localeSwitcherAria: "Stock Explorer language",
  },

  bn: {
    hero: {
      eyebrow: "Stock Explorer",
      title: "দ্রুত শেয়ার খুঁজে বের করুন",
      loadingSubtitle: "Session-এর দামসহ শেয়ার লোড হচ্ছে…",
      readySubtitle: ({
        filteredCount,
        listedStockCount,
        loadedPriceCount,
        visibleCount,
        isTableFiltered,
      }) =>
        isTableFiltered
          ? `Session-backed ${loadedPriceCount}টির মধ্যে ${filteredCount}টি দেখানো হচ্ছে (মোট listed ${listedStockCount})।`
          : `${listedStockCount}টি listed শেয়ারের মধ্যে ${filteredCount}টি price-backed (${loadedPriceCount}টিতে session data)। দেখানো হচ্ছে ${visibleCount}টি।`,
    },
    search: {
      globalPlaceholder: "যেকোনো শেয়ার খুঁজুন…",
      globalAriaLabel: "Global stock search",
      tablePlaceholder: "Symbol বা নাম দিয়ে সার্চ করুন…",
      tableAriaLabel: "Filter Explorer table",
      clearTableSearchAria: "টেবিল ফিল্টার মুছুন",
    },
    filters: {
      toolbarAria: "Explorer টেবিল ফিল্টার",
      allActions: "সব action",
      allVolume: "সব volume",
      volumeExpansion: "Volume বেড়েছে",
      volumeNormal: "সাধারণ volume",
      volumeThin: "কম volume",
      portfolioScopeAria: "Portfolio scope",
      watchlist: "Watchlist",
      holdings: "Holdings",
      reset: "Reset",
    },
    columns: {
      symbol: "Symbol",
      price: "Price",
      change: "% Change",
      turnover: "Turnover",
      volume: "Volume",
      rsi: "RSI",
      action: "Action",
      evidence: "Evidence",
      sector: "Sector",
      category: "Cat.",
    },
    states: {
      warmingUp: "Market view এখনো তৈরি হচ্ছে।",
      loadError: "Stock Explorer-এর তথ্য আনা যাচ্ছে না।",
      loadingMore: "আরও row লোড হচ্ছে...",
      scrollForMore: "আরও দেখতে নিচে স্ক্রল করুন",
      emptyWatchlistTitle: "Watchlist-এ মিল নেই",
      emptyWatchlistBody:
        "Explorer থেকে শেয়ারে স্টার দিয়ে Watchlist বানান, অথবা Watchlist ফিল্টার বন্ধ করে সব দেখুন।",
      emptyHoldingsTitle: "Holdings-এ মিল নেই",
      emptyHoldingsBody:
        "লিংক করা portfolio holdings এখানে আসবে। Holdings ফিল্টার বন্ধ করে পুরো universe দেখুন।",
      emptySearchTitle: (query) => `‘${query}’-এর সাথে কোনো Explorer row মেলেনি।`,
      emptySearchBody: "টেবিল ফিল্টার মুছুন, অথবা Action, Volume, Watchlist ও Holdings Reset করুন।",
      emptyFiltersTitle: "এই Filter-এ কোনো শেয়ার নেই",
      emptyFiltersBody: "Action বা Volume ফিল্টার শিথিল করে আবার দেখুন।",
      resetFiltersAction: "টেবিল ফিল্টার Reset",
    },
    localeSwitcherAria: "Stock Explorer ভাষা",
  },
} as const satisfies Record<AppLocale, StockExplorerLanguage>;

export function getStockExplorerLanguage(locale: AppLocale = DEFAULT_LOCALE): StockExplorerLanguage {
  return stockExplorerLanguage[locale] ?? stockExplorerLanguage[DEFAULT_LOCALE];
}
