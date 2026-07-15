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
        "No eligible current-session stock matches this versioned condition.",
      sectionEyebrow: "Scanner",
      momentumAria: "Momentum strength",
    },
    categories: {
      volume_breakouts: {
        title: "Price-volume Break Events",
        descriptionDefault:
          "Crossed prior resistance from below with expanded relative volume.",
        descriptionAdvanced:
          "Current-session close crossed canonical resistance with expanded relative volume.",
      },
      support_rebound: {
        title: "Support Reclaim",
        descriptionDefault:
          "Reclaimed canonical support from below, remains in the support band, and has weak RSI.",
      },
      risk_compression: {
        title: "Low-volatility Compression",
        descriptionDefault:
          "Eligible names inside the versioned low-volatility compression band.",
      },
      momentum_continuation: {
        title: "Momentum Continuation",
        descriptionDefault:
          "Uptrend confirmed by a positive multi-day return.",
      },
      breakdown_risk: {
        title: "Support-break Events",
        descriptionDefault:
          "Crossed below canonical support from the prior close; risk alone does not qualify.",
      },
      oversold_rebound: {
        title: "Weak-RSI Support Reclaim",
        descriptionDefault:
          "Weak RSI plus a current-session reclaim of canonical support from below.",
      },
    },
    localeSwitcherAria: "Scanner language",
  },

  bn: {
    hero: {
      eyebrow: "Market Scanner",
      title: "Daily opportunity detection",
      subtitle:
        "সর্বশেষ বাজারের তথ্য দেখে সম্ভাবনাময় শেয়ার ও POTENTIAL BUY/WAIT/SELL সিদ্ধান্ত",
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
        "বর্তমান session-এ eligible কোনো শেয়ার এই versioned শর্তে মেলেনি।",
      sectionEyebrow: "Scanner",
      momentumAria: "Momentum কতটা শক্ত",
    },

    categories: {
      volume_breakouts: {
        title: "Price-volume Break Event",
        descriptionDefault:
          "নিচ থেকে আগের Resistance পার করেছে, সঙ্গে relative Volume বেড়েছে।",
        descriptionAdvanced:
          "বর্তমান session-এর Close canonical Resistance পার করেছে, সঙ্গে relative Volume বেড়েছে।",
      },

      support_rebound: {
        title: "Support Reclaim",
        descriptionDefault:
          "নিচ থেকে canonical Support ফিরে পেয়েছে, support band-এর মধ্যে আছে এবং RSI দুর্বল।",
      },

      risk_compression: {
        title: "Low-volatility Compression",
        descriptionDefault:
          "Eligible শেয়ার versioned low-volatility compression band-এর মধ্যে আছে।",
      },

      momentum_continuation: {
        title: "Momentum ধরে রেখেছে",
        descriptionDefault:
          "দাম ঊর্ধ্বমুখী, কয়েক দিনের Return-ও Positive।",
      },

      breakdown_risk: {
        title: "Support-break Event",
        descriptionDefault:
          "আগের Close থেকে canonical Support-এর নিচে নেমেছে; শুধু risk বেশি হলেই এখানে আসবে না।",
      },

      oversold_rebound: {
        title: "Weak-RSI Support Reclaim",
        descriptionDefault:
          "RSI দুর্বল এবং বর্তমান session-এ নিচ থেকে canonical Support ফিরে পেয়েছে।",
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
