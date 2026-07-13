import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type ScannerCategoryId =
  | "volume_breakouts"
  | "support_rebound"
  | "risk_compression"
  | "momentum_continuation"
  | "breakdown_risk"
  | "oversold_rebound";

type ScannerCategoryCopy = {
  title: string;
  descriptionDefault: string;
  descriptionAdvanced?: string;
};

export type ScannerLanguage = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    filterContextName: string;
  };
  filters: {
    watchlistAria: string;
    allStocks: string;
    watchlistedOnly: string;
    notWatchlisted: string;
    holdingsOnly: string;
    myWatchlist: string;
  };
  states: {
    loadError: string;
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    sectionEyebrow: string;
    momentumAria: string;
  };
  categories: Record<ScannerCategoryId, ScannerCategoryCopy>;
  localeSwitcherAria: string;
};

const scannerLanguage = {
  en: {
    hero: {
      eyebrow: "Market Scanner",
      title: "Daily opportunity detection",
      subtitle:
        "Rule-based scans from latest OHLCV with shared trader decision badges",
      filterContextName: "scanner",
    },
    filters: {
      watchlistAria: "Watchlist filters",
      allStocks: "All stocks",
      watchlistedOnly: "Watchlisted only",
      notWatchlisted: "Not watchlisted",
      holdingsOnly: "Holdings only",
      myWatchlist: "My watchlist",
    },
    states: {
      loadError: "Could not load scanner data.",
      loading: "Scanning market universe...",
      emptyTitle: "No names match this scan yet",
      emptyDescription:
        "This means the current universe has no high-conviction candidates for this condition, not that market data is missing.",
      sectionEyebrow: "Scanner",
      momentumAria: "Momentum strength",
    },
    categories: {
      volume_breakouts: {
        title: "Volume-confirmed Breakouts",
        descriptionDefault:
          "Clearing prior resistance on expanding volume (shared breakout flag).",
        descriptionAdvanced:
          "Closing above prior resistance on expanding volume (shared breakout flag).",
      },
      support_rebound: {
        title: "Support-rebound Candidates",
        descriptionDefault:
          "Near recent support, oversold, and already turning up (confirmed rebound).",
      },
      risk_compression: {
        title: "Risk / Compression Watchlist",
        descriptionDefault:
          "High-risk or low-volatility names that need confirmation before action.",
      },
      momentum_continuation: {
        title: "Momentum Continuation",
        descriptionDefault:
          "Uptrend confirmed by a positive multi-day return.",
      },
      breakdown_risk: {
        title: "Breakdown Risk",
        descriptionDefault:
          "Sell actions or elevated risk from the shared decision engine.",
      },
      oversold_rebound: {
        title: "Oversold Rebound",
        descriptionDefault:
          "Below RSI 40 and already turning up on the session (not just falling).",
      },
    },
    localeSwitcherAria: "Scanner language",
  },

  bn: {
    hero: {
      eyebrow: "Market Scanner",
      title: "Daily opportunity detection",
      subtitle:
        "সর্বশেষ বাজারের তথ্য দেখে সম্ভাবনাময় শেয়ার ও BUY/HOLD/SELL সিদ্ধান্ত",
      filterContextName: "scanner",
    },

    filters: {
      watchlistAria: "Watchlist filter",
      allStocks: "সব শেয়ার",
      watchlistedOnly: "শুধু Watchlist",
      notWatchlisted: "Watchlist-এর বাইরে",
      holdingsOnly: "শুধু Holding",
      myWatchlist: "আমার Watchlist",
    },

    states: {
      loadError: "Scanner-এর তথ্য আনা যাচ্ছে না।",
      loading: "বাজারে সুযোগ খোঁজা হচ্ছে...",
      emptyTitle: "এই শর্তে এখনো কোনো শেয়ার নেই",
      emptyDescription:
        "এখনো শক্তিশালী কোনো candidate পাওয়া যায়নি। এর মানে data নেই—তা নয়।",
      sectionEyebrow: "Scanner",
      momentumAria: "Momentum কতটা শক্ত",
    },

    categories: {
      volume_breakouts: {
        title: "Volume-সহ Breakout",
        descriptionDefault:
          "আগের Resistance পার হচ্ছে, সঙ্গে Volume-ও বাড়ছে।",
        descriptionAdvanced:
          "আগের Resistance-এর ওপরে Close, সঙ্গে Volume বাড়ছে।",
      },

      support_rebound: {
        title: "Support থেকে ঘুরে দাঁড়ানো",
        descriptionDefault:
          "দাম Support-এর কাছে, অনেকটা নেমেছে, এখন আবার উঠতে শুরু করেছে।",
      },

      risk_compression: {
        title: "ঝুঁকিপূর্ণ শেয়ার নজরে",
        descriptionDefault:
          "ঝুঁকি বেশি বা দাম খুব কম নড়ছে—সিদ্ধান্তের আগে Confirmation দরকার।",
      },

      momentum_continuation: {
        title: "Momentum ধরে রেখেছে",
        descriptionDefault:
          "দাম ঊর্ধ্বমুখী, কয়েক দিনের Return-ও Positive।",
      },

      breakdown_risk: {
        title: "Breakdown-এর ঝুঁকি",
        descriptionDefault:
          "SELL signal এসেছে বা ঝুঁকির মাত্রা বেড়েছে।",
      },

      oversold_rebound: {
        title: "বেশি নামার পর বর্তমান অবস্থা",
        descriptionDefault:
          "RSI 40-এর নিচে, তবে দাম আবার উঠতে শুরু করেছে।",
      },
    },

    localeSwitcherAria: "Scanner-এর ভাষা",
  },
} as const satisfies Record<AppLocale, ScannerLanguage>;

export function getScannerLanguage(
  locale: AppLocale,
): ScannerLanguage {
  return scannerLanguage[locale] ?? scannerLanguage[DEFAULT_LOCALE];
}

export function getScannerCategoryDescription(
  category: ScannerCategoryCopy,
  advanced: boolean,
): string {
  if (advanced && category.descriptionAdvanced) {
    return category.descriptionAdvanced;
  }

  return category.descriptionDefault;
}