import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

export type MarketNarrativeKey =
  | "buyers_active"
  | "sellers_dominant"
  | "early_recovery"
  | "sideways_waiting"
  | "index_stable_breadth_weak"
  | "volume_not_confirming"
  | "volume_confirms_move"
  | "strong_liquidity"
  | "weak_liquidity"
  | "average_liquidity"
  | "participation_above"
  | "participation_below"
  | "participation_near"
  | "balanced_breadth"
  | "momentum_chase_risk";

export type DashboardLanguage = {
  pulse: {
    ariaLabel: string;
    performanceAriaLabel: string;
    awaitingIndex: string;
    dayOpen: string;
    dayHigh: string;
    dayLow: string;
    weekRange: string;
    marketPrefix: string;
    leaderPrefix: string;
    turnoverCategory: string;
    volumeCategory: string;
    breadthCategory: string;
    leadersCategory: string;
    vsYesterday: string;
    vs30DayAvg: string;
    typical30D: string;
    liquidityVs30D: string;
    participationStrength: string;
    advDeclRatio: string;
    adv: string;
    unch: string;
    decl: string;
    exchangeTurnover: string;
    exchangeTurnoverSnapshot: string;
    exchangeVolume: string;
    exchangeVolumeSnapshot: string;
  };
  direction: {
    buyers: string;
    sellers: string;
    mixed: string;
  };
  narratives: Record<MarketNarrativeKey, string>;
  breadthSummary: (
    advancing: number,
    declining: number,
    unchanged: number,
  ) => string;
  breadthPanel: {
    eyebrow: string;
    title: string;
    advancing: (count: number) => string;
    declining: (count: number) => string;
    unchanged: (count: number) => string;
  };
  heatmap: {
    eyebrow: string;
    title: string;
    description: string;
    marketCap: string;
    liquidity: string;
    advancing: (count: number) => string;
    declining: (count: number) => string;
    mapped: (count: number) => string;
    unclassified: string;
    liquidityScore: (score: number) => string;
    empty: string;
    emptyTitle: string;
    emptyDescription: string;
    names: (count: number) => string;
  };
  movers: {
    eyebrow: string;
    topGainers: string;
    topLosers: string;
    liquidityWatch: string;
    turnoverLeaders: string;
    turnoverSuffix: string;
    empty: string;
  };
  signals: {
    eyebrow: string;
    title: string;
    empty: string;
    warmup: string;
    confidence: (value: string) => string;
    risk: (value: string) => string;
    awaitingContext: string;
  };
  timeline: {
    eyebrow: string;
    title: string;
    empty: string;
  };
  insights: {
    eyebrow: string;
    title: string;
  };
  states: {
    backendError: string;
    awaitingMarketSummary: string;
    staleDisclaimer: string;
    indexPending: string;
    indexUnavailable: string;
    marketMood: string;
    turnover: string;
    listedStocks: string;
    advancingDeclining: (
      advancing: number,
      declining: number,
    ) => string;
    awaitingCoverage: string;
    latestTurnover: string;
    priceBackedHelper: (count: number) => string;
  };
  hero: {
    topSector: string;
    runnerUp: string;
    topStock: string;
    coverage: string;
    leadershipPending: string;
    leadersFooter: string;
  };
  skeletons: {
    pulseLoading: string;
    pulseLoadingAria: string;
  };
  freshness: {
    syncing: string;
    statusUnavailable: string;
    statusUnavailableTitle: string;
    lastUpdated: (relative: string) => string;
    noSnapshotYet: string;
    lastUpdatedPending: string;
    refreshAria: string;
    refreshTitle: string;
    refreshDisabledTitle: string;
    synced: (label: string) => string;
    session: (label: string) => string;
    nextUpdate: (label: string) => string;
  };
};

const dashboardLanguage = {
  en: {
    pulse: {
      ariaLabel: "Market pulse",
      performanceAriaLabel: "Market performance",
      awaitingIndex: "Awaiting index data",
      dayOpen: "Day Open",
      dayHigh: "Day High",
      dayLow: "Day Low",
      weekRange: "52 Week Range",
      marketPrefix: "Market",
      leaderPrefix: "Leader",
      turnoverCategory: "Turnover",
      volumeCategory: "Volume",
      breadthCategory: "Breadth",
      leadersCategory: "Leaders",
      vsYesterday: "vs Yesterday",
      vs30DayAvg: "vs 30D Avg",
      typical30D: "30D Typical",
      liquidityVs30D: "Liquidity vs 30D avg",
      participationStrength: "Participation Strength",
      advDeclRatio: "Adv/Decl Ratio",
      adv: "Adv",
      unch: "Unch",
      decl: "Decl",
      exchangeTurnover: "Exchange turnover",
      exchangeTurnoverSnapshot: "Exchange turnover snapshot",
      exchangeVolume: "Exchange volume",
      exchangeVolumeSnapshot: "Exchange volume snapshot",
    },
    direction: {
      buyers: "Buyers In Control",
      sellers: "Sellers In Control",
      mixed: "Mixed Session",
    },
    narratives: {
      buyers_active: "Buyers are becoming more active.",
      sellers_dominant: "Selling pressure is dominating the session.",
      early_recovery:
        "The market is showing early signs of strength, but participation is still limited.",
      sideways_waiting:
        "The market is moving sideways while traders wait for direction.",
      index_stable_breadth_weak:
        "Most stocks are under pressure despite a stable index.",
      volume_not_confirming:
        "Prices are rising, but volume is not confirming the move yet.",
      volume_confirms_move: "Volume is keeping pace with the move.",
      strong_liquidity: "Strong liquidity today.",
      weak_liquidity: "Liquidity is running below the recent average.",
      average_liquidity: "Liquidity is near the recent average.",
      participation_above: "Participation is above the recent average.",
      participation_below: "Participation is below the recent average.",
      participation_near: "Participation is near the recent average.",
      balanced_breadth: "Advancers and decliners are fairly balanced.",
      momentum_chase_risk:
        "Momentum is positive, but chasing the move may be risky.",
    },
    breadthSummary: (advancing, declining, unchanged) =>
      `More stocks advanced than declined today (${advancing} up, ${declining} down, ${unchanged} flat).`,
    breadthPanel: {
      eyebrow: "Market Breadth",
      title: "Advancing, declining, unchanged",
      advancing: (count) => `Advancing: ${count}`,
      declining: (count) => `Declining: ${count}`,
      unchanged: (count) => `Unchanged: ${count}`,
    },
    heatmap: {
      eyebrow: "Institutional Heatmap",
      title: "Sector-weighted market map",
      description:
        "All price-backed names grouped by sector; tile color shows latest price pressure.",
      marketCap: "Market cap",
      liquidity: "Liquidity",
      advancing: (count) => `${count} advancing`,
      declining: (count) => `${count} declining`,
      mapped: (count) => `${count} mapped`,
      unclassified: "Unclassified",
      liquidityScore: (score) => `Liquidity ${score}%`,
      empty: "Heatmap tiles will appear after the next market scan.",
      emptyTitle: "Market map awaiting price rows",
      emptyDescription:
        "Once latest OHLCV data syncs, this area will rank liquid sector clusters and attention-worthy movers.",
      names: (count) => `${count} names`,
    },
    movers: {
      eyebrow: "Market Movers",
      topGainers: "Top gainers",
      topLosers: "Top losers",
      liquidityWatch: "Liquidity watch",
      turnoverLeaders: "Turnover Leaders",
      turnoverSuffix: "turnover",
      empty: "No price-backed movers are available yet.",
    },
    signals: {
      eyebrow: "Smart Signals",
      title: "Explanation-first feed",
      empty:
        "No actionable deterministic signals yet for the loaded market universe.",
      warmup:
        "Trader signals are warming up after startup. This section should populate shortly.",
      confidence: (value) => `${value} confidence`,
      risk: (value) => `${value} risk`,
      awaitingContext: "Awaiting stronger context",
    },
    timeline: {
      eyebrow: "Market Timeline",
      title: "Events and operating context",
      empty: "Timeline events will appear after the next market scan.",
    },
    insights: {
      eyebrow: "Insights",
      title: "Deterministic intelligence",
    },
    states: {
      backendError:
        "Backend data is unavailable. Showing resilient workspace placeholders based on current contracts.",
      awaitingMarketSummary: "Awaiting market summary",
      staleDisclaimer:
        "This view is based on the latest available market data.",
      indexPending: "Index pending",
      indexUnavailable: "Synced DSEX data unavailable",
      marketMood: "Market Mood",
      turnover: "Turnover",
      listedStocks: "Listed Stocks",
      advancingDeclining: (advancing, declining) =>
        `${advancing} advancing, ${declining} declining`,
      awaitingCoverage: "Awaiting latest price coverage",
      latestTurnover: "Latest exchange turnover",
      priceBackedHelper: (count) =>
        `${count} price-backed names evaluated for analytics`,
    },
    hero: {
      topSector: "Top Sector",
      runnerUp: "Runner-up",
      topStock: "Top Stock",
      coverage: "Coverage",
      leadershipPending: "Leadership pending",
      leadersFooter: "Based on price change %",
    },
    skeletons: {
      pulseLoading: "Loading market pulse",
      pulseLoadingAria: "Loading market pulse",
    },
    freshness: {
      syncing: "Syncing…",
      statusUnavailable: "Status unavailable",
      statusUnavailableTitle: "Market snapshot status unavailable",
      lastUpdated: (relative) => `Last updated ${relative}`,
      noSnapshotYet: "No snapshot yet",
      lastUpdatedPending: "Last updated …",
      refreshAria: "Refresh market data",
      refreshTitle: "Refresh market data",
      refreshDisabledTitle: "Refresh unavailable during this session",
      synced: (label) => `Synced ${label}`,
      session: (label) => `Session: ${label}`,
      nextUpdate: (label) => `Next update: ${label}`,
    },
  },

  bn: {
    pulse: {
      ariaLabel: "Market pulse",
      performanceAriaLabel: "Market performance",
      awaitingIndex: "Index data আসছে",
      dayOpen: "Day Open",
      dayHigh: "Day High",
      dayLow: "Day Low",
      weekRange: "52 Week Range",
      marketPrefix: "Market",
      leaderPrefix: "Leader",
      turnoverCategory: "Turnover",
      volumeCategory: "Volume",
      breadthCategory: "Breadth",
      leadersCategory: "Leaders",
      vsYesterday: "vs Yesterday",
      vs30DayAvg: "vs 30D Avg",
      typical30D: "30D Typical",
      liquidityVs30D: "Liquidity vs 30D avg",
      participationStrength: "Participation Strength",
      advDeclRatio: "Adv/Decl Ratio",
      adv: "Adv",
      unch: "Unch",
      decl: "Decl",
      exchangeTurnover: "Exchange turnover",
      exchangeTurnoverSnapshot: "Exchange turnover snapshot",
      exchangeVolume: "Exchange volume",
      exchangeVolumeSnapshot: "Exchange volume snapshot",
    },
    direction: {
      buyers: "Buyers এগিয়ে",
      sellers: "Sellers এগিয়ে",
      mixed: "Mixed Session",
    },
    narratives: {
      buyers_active: "Buyers এগিয়ে",
      sellers_dominant: "আজ sell pressure বেশি",
      early_recovery: "বাজার ঘুরে দাঁড়ানোর ইঙ্গিত দিচ্ছে",
      sideways_waiting: "বাজার এখনো দিক খুঁজছে",
      index_stable_breadth_weak:
        "Index স্থির, কিন্তু বেশিরভাগ শেয়ার চাপে",
      volume_not_confirming: "দাম উঠছে, volume এখনো সঙ্গে নেই",
      volume_confirms_move: "দাম আর volume একই দিকে",
      strong_liquidity: "লেনদেন বেশ ভালো",
      weak_liquidity: "লেনদেন কিছুটা কম",
      average_liquidity: "লেনদেন স্বাভাবিক",
      participation_above: "আজ participation ভালো",
      participation_below: "আজ participation কম",
      participation_near: "Participation স্বাভাবিক",
      balanced_breadth: "উঠা-নামা প্রায় সমান",
      momentum_chase_risk:
        "Momentum আছে, তবে এখন ঢোকায় ঝুঁকি আছে",
    },
    breadthSummary: (advancing, declining, unchanged) =>
      `বেড়েছে ${advancing}, কমেছে ${declining}, স্থির ${unchanged}`,
    breadthPanel: {
      eyebrow: "Market Breadth",
      title: "বাজারের ভেতরের চিত্র",
      advancing: (count) => `বেড়েছে: ${count}`,
      declining: (count) => `কমেছে: ${count}`,
      unchanged: (count) => `স্থির: ${count}`,
    },
    heatmap: {
      eyebrow: "Institutional Heatmap",
      title: "সেক্টর ম্যাপ",
      description: "রঙ দেখেই বুঝুন কোথায় শক্তি, কোথায় চাপ",
      marketCap: "Market cap",
      liquidity: "Liquidity",
      advancing: (count) => `${count} advancing`,
      declining: (count) => `${count} declining`,
      mapped: (count) => `${count} mapped`,
      unclassified: "Unclassified",
      liquidityScore: (score) => `Liquidity ${score}%`,
      empty: "পরের scan-এর পর heatmap দেখা যাবে",
      emptyTitle: "সেক্টর ম্যাপ এখনো প্রস্তুত নয়",
      emptyDescription:
        "নতুন price data এলে সেক্টরের নড়াচড়া এখানে দেখা যাবে",
      names: (count) => `${count} names`,
    },
    movers: {
      eyebrow: "Market Movers",
      topGainers: "Top gainers",
      topLosers: "Top losers",
      liquidityWatch: "Liquidity watch",
      turnoverLeaders: "Turnover Leaders",
      turnoverSuffix: "turnover",
      empty: "এখনো নজরকাড়া mover নেই",
    },
    signals: {
      eyebrow: "Smart Signals",
      title: "বাজারের signal বিশ্লেষণ",
      empty: "এখনো সিদ্ধান্ত নেওয়ার মতো signal নেই",
      warmup: "Signals তৈরি হচ্ছে—একটু পর দেখুন",
      confidence: (value) => `${value} confidence`,
      risk: (value) => `${value} risk`,
      awaitingContext: "আরও পরিষ্কার context দরকার",
    },
    timeline: {
      eyebrow: "Market Timeline",
      title: "আজ বাজারে কী ঘটছে",
      empty: "নতুন event এলে এখানে দেখা যাবে",
    },
    insights: {
      eyebrow: "Insights",
      title: "বাজার কী বলছে",
    },
    states: {
      backendError:
        "ডেটা আনা যাচ্ছে না। আপাতত সর্বশেষ তথ্য দেখানো হচ্ছে",
      awaitingMarketSummary: "আজকের বাজারের ছবি এখনো তৈরি হয়নি",
      staleDisclaimer: "সর্বশেষ পাওয়া বাজারের তথ্য দেখানো হচ্ছে",
      indexPending: "DSEX update আসছে",
      indexUnavailable: "DSEX data এখনো পাওয়া যায়নি",
      marketMood: "Market Mood",
      turnover: "Turnover",
      listedStocks: "Listed Stocks",
      advancingDeclining: (advancing, declining) =>
        `${advancing} বেড়েছে, ${declining} কমেছে`,
      awaitingCoverage: "আরও price data আসছে",
      latestTurnover: "Latest Turnover",
      priceBackedHelper: (count) =>
        `${count}টি শেয়ারের data বিশ্লেষণ করা হয়েছে`,
    },
    hero: {
      topSector: "Top Sector",
      runnerUp: "Runner-up",
      topStock: "Top Stock",
      coverage: "Coverage",
      leadershipPending: "Leader এখনো পরিষ্কার নয়",
      leadersFooter: "Price change % অনুযায়ী",
    },
    skeletons: {
      pulseLoading: "Market pulse লোড হচ্ছে",
      pulseLoadingAria: "Market pulse লোড হচ্ছে",
    },
    freshness: {
      syncing: "Syncing…",
      statusUnavailable: "Status unavailable",
      statusUnavailableTitle: "Market snapshot status unavailable",
      lastUpdated: (relative) => `Last updated ${relative}`,
      noSnapshotYet: "No snapshot yet",
      lastUpdatedPending: "Last updated …",
      refreshAria: "Refresh market data",
      refreshTitle: "Refresh market data",
      refreshDisabledTitle: "Refresh unavailable during this session",
      synced: (label) => `Synced ${label}`,
      session: (label) => `Session: ${label}`,
      nextUpdate: (label) => `Next update: ${label}`,
    },
  },
} as const satisfies Record<AppLocale, DashboardLanguage>;

export function getDashboardLanguage(
  locale: AppLocale,
): DashboardLanguage {
  return dashboardLanguage[locale] ?? dashboardLanguage[DEFAULT_LOCALE];
}