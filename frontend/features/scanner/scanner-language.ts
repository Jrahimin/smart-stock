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
  metrics: {
    rsi: string;
    vol: string;
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
        "Explore stocks by measured price, volume and risk conditions",
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
    metrics: {
      rsi: "RSI",
      vol: "Vol",
    },
    categories: {
      volume_breakouts: {
        title: "Price-volume Break Events",
        descriptionDefault:
          "Crossed prior resistance from below with expanded relative volume.",
        descriptionAdvanced:
          "Current-session close crossed resistance with expanded relative volume.",
      },
      support_rebound: {
        title: "Support rebound",
        descriptionDefault:
          "Reclaimed support from below, remains in the support band, and has weak RSI.",
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
          "Crossed below support from the prior close; risk alone does not qualify.",
      },
      oversold_rebound: {
        title: "Support rebound",
        descriptionDefault:
          "Weak RSI plus a current-session reclaim of support from below.",
      },
    },
    localeSwitcherAria: "Scanner language",
  },

  bn: {
    hero: {
      eyebrow: "বাজার স্ক্যানার",
      title: "শর্ত মিলিয়ে শেয়ার খুঁজুন",
      subtitle:
        "দাম, কেনাবেচা ও ঝুঁকির শর্ত মিলিয়ে শেয়ার দেখুন",
      filterContextName: "scanner",
    },

    filters: {
      watchlistAria: "নজরে রাখা শেয়ারের ফিল্টার",
      allStocks: "সব শেয়ার",
      watchlistedOnly: "শুধু নজরে রাখা",
      notWatchlisted: "নজরের তালিকার বাইরে",
      holdingsOnly: "শুধু হোল্ডিং",
      myWatchlist: "আমার নজরের তালিকা",
    },

    states: {
      loadError: "স্ক্যানারের তথ্য আনা যাচ্ছে না।",
      loading: "বাজারে সুযোগ খোঁজা হচ্ছে...",
      emptyTitle: "এই শর্তে এখনো কোনো শেয়ার নেই",
      emptyDescription:
        "এই কার্যদিবসের যোগ্য কোনো শেয়ার নির্ধারিত শর্তে মেলেনি।",
      sectionEyebrow: "স্ক্যানার",
      momentumAria: "দামের গতির শক্তি",
    },
    metrics: {
      rsi: "RSI",
      vol: "লেনদেন",
    },

    categories: {
      volume_breakouts: {
        title: "দাম ও লেনদেনে উত্থান",
        descriptionDefault:
          "দাম আগের প্রতিরোধসীমা পেরিয়েছে, সঙ্গে স্বাভাবিকের তুলনায় লেনদেন বেড়েছে।",
        descriptionAdvanced:
          "দিনশেষের দাম প্রতিরোধসীমা পেরিয়েছে, সঙ্গে স্বাভাবিকের তুলনায় লেনদেন বেড়েছে।",
      },

      support_rebound: {
        title: "সমর্থনমূল্য থেকে ঘুরে দাঁড়ানো",
        descriptionDefault:
          "দাম নিচ থেকে সমর্থনসীমায় ফিরেছে এবং সেই সীমার মধ্যে আছে। RSI এখনও দুর্বল।",
      },

      risk_compression: {
        title: "দামের ওঠানামা কমেছে",
        descriptionDefault:
          "যোগ্য শেয়ারের ওঠানামা নির্ধারিত কম অস্থিরতার সীমার মধ্যে আছে।",
      },

      momentum_continuation: {
        title: "ঊর্ধ্বমুখী গতি ধরে রেখেছে",
        descriptionDefault:
          "দাম ঊর্ধ্বমুখী, কয়েক দিনের রিটার্নও ইতিবাচক।",
      },

      breakdown_risk: {
        title: "সমর্থনমূল্যের নিচে নেমেছে",
        descriptionDefault:
          "দাম আগের দিনশেষের অবস্থান থেকে সমর্থনমূল্যের নিচে নেমেছে।",
      },

      oversold_rebound: {
        title: "সমর্থনমূল্য থেকে ঘুরে দাঁড়ানো",
        descriptionDefault:
          "RSI দুর্বল, তবে এই কার্যদিবসে দাম নিচ থেকে সমর্থনমূল্যে ফিরেছে।",
      },
    },

    localeSwitcherAria: "স্ক্যানারের ভাষা",
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
