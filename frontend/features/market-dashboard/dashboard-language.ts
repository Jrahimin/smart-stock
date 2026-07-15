import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type { DecisionReasonCopy } from "@/lib/market/trader-decision-reason";
import type { InsightCategory } from "@/lib/insights/insight-types";

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

export type MarketMoodInsightKey =
  | "accumulation"
  | "bullish"
  | "bearish"
  | "high_volatility"
  | "weak_recovery"
  | "cautious";

export type TurnoverLiquidityInsightKey = "strong_liquidity" | "weak_liquidity" | "average_liquidity";

export type TurnoverInsightContext = {
  turnoverLabel: string;
  vsYesterday: string;
  vs30DayAvg: string;
  liquidityKey: TurnoverLiquidityInsightKey;
};

function buildEnglishDecisionReasons(): DecisionReasonCopy {
  return {
    stale_sparse_data: "Data is stale or sparse; wait for fresher confirmation.",
    corporate_action_adjustment:
      "Sharp single-session drop looks like a corporate-action/ex-date adjustment rather than a breakdown; wait for confirmation.",
    failed_support: "Price has failed recent support.",
    data_not_eligible:
      "Data is not sufficient to take a decision; wait for review.",
    buy_uptrend_reward: "Uptrend with favorable opportunity and acceptable reward potential.",
    buy_uptrend_resistance_test:
      "Uptrend with favorable opportunity and resistance test participation.",
    uptrend_near_resistance_wait_volume:
      "Uptrend is constructive near resistance; wait for stronger volume confirmation.",
    high_risk_selective_setup:
      "High-risk name with strong trend and participation; treat as a selective setup.",
    bearish_structure: "Bearish structure dominates the setup.",
    risk_wait_confirmation: ({ riskLabel = "elevated" }) =>
      `Risk level is ${riskLabel}; wait for cleaner confirmation rather than forcing a trade.`,
    momentum_extended_wait_entry:
      "Momentum is extended near resistance; wait for a better entry.",
    momentum_elevated_hold:
      "Momentum is elevated but the uptrend remains intact; hold rather than chase.",
    near_resistance_no_uptrend:
      "Price is near resistance without an uptrend; wait for confirmation.",
    constructive_hold:
      "Structure remains constructive; hold existing positions or wait for cleaner entry.",
    sideways_constructive_monitor:
      "Sideways base with constructive opportunity; monitor for directional confirmation.",
    no_directional_edge: "No strong directional edge; patience is preferred.",
    reward_risk_below_minimum: ({ riskReward = 0, minRiskReward = 0 }) =>
      `Reward/risk ${riskReward.toFixed(2)} is below the ${minRiskReward.toFixed(1)} minimum; hold rather than buy at this price.`,
    lower_structure_hold:
      "Market structure shows lower highs and lower lows; hold rather than buy into weakness.",
    bearish_regime_hold:
      "Broad market regime is bearish; hold rather than open new long exposure.",
    confidence_capped_bearish_regime: ({ confidenceCap = 0 }) =>
      `Evidence strength capped at ${confidenceCap} in a bearish market regime.`,
    decision_engine_unavailable:
      "Decision engine unavailable for this row; defaulting to wait.",
    unknown: "Awaiting a clearer decision summary.",
  };
}

function buildBanglaDecisionReasons(): DecisionReasonCopy {
  return {
    stale_sparse_data: "ডেটা পুরনো বা কম; নতুন ডেটা দিয়ে নিশ্চিত হওয়া পর্যন্ত অপেক্ষা করুন।",
    corporate_action_adjustment:
      "এক দিনের তীব্র পতনটি corporate action বা ex-date adjustment-এর কারণে হতে পারে; breakdown নিশ্চিত না হওয়া পর্যন্ত অপেক্ষা করুন।",
    failed_support: "দাম সাম্প্রতিক support-এর নিচে নেমে গেছে।",
    data_not_eligible:
      "সিদ্ধান্ত নেয়ার মতো পর্যাপ্ত তথ্য নেই; পর্যালোচনা বা আপডেটের জন্য অপেক্ষা করুন।",
    buy_uptrend_reward: "Uptrend-এ ভালো সুযোগ আছে; লাভের সম্ভাবনাও ভালো।",
    buy_uptrend_resistance_test:
      "Uptrend-এ ভালো সুযোগ আছে; resistance-এর কাছে শেয়ারের আচরণও নজরে রাখার মতো।",
    uptrend_near_resistance_wait_volume:
      "Resistance-এর কাছে এসেও Uptrend ঠিক আছে; আরও শক্তিশালী volume confirmation না পাওয়া পর্যন্ত অপেক্ষা করুন।",
    high_risk_selective_setup:
      "ঝুঁকি বেশি, তবে trend ও participation শক্তিশালী; বেছে বেছে এগোনোর setup।",
    bearish_structure: "দামের গঠন bearish; এখনো চাপই বেশি।",
    risk_wait_confirmation: ({ riskLabel = "elevated" }) =>
      `ঝুঁকির মাত্রা ${riskLabel}; জোর করে trade না নিয়ে পরিষ্কার confirmation-এর জন্য অপেক্ষা করুন।`,
    momentum_extended_wait_entry:
      "Resistance-এর কাছে momentum অনেকটা বেড়ে গেছে; ভালো entry-র জন্য অপেক্ষা করুন।",
    momentum_elevated_hold:
      "Momentum শক্তিশালী, Uptrend-ও ঠিক আছে; এখন chase না করে hold করুন।",
    near_resistance_no_uptrend:
      "দাম resistance-এর কাছে, কিন্তু Uptrend নেই; confirmation না পাওয়া পর্যন্ত অপেক্ষা করুন।",
    constructive_hold:
      "দামের গঠন ভালো আছে; আগের position hold করুন বা আরও ভালো entry-র অপেক্ষা করুন।",
    sideways_constructive_monitor:
      "Sideways base তৈরি হচ্ছে; দিক পরিষ্কার হওয়া পর্যন্ত নজরে রাখুন।",
    no_directional_edge: "বাজারের দিক এখনো পরিষ্কার নয়; ধৈর্য ধরাই ভালো।",
    reward_risk_below_minimum: ({ riskReward = 0, minRiskReward = 0 }) =>
      `লাভ-ঝুঁকির অনুপাত ${riskReward.toFixed(2)} ন্যূনতম ${minRiskReward.toFixed(1)}-এর নিচে; এই দামে buy না করে hold করাই ভালো।`,
    lower_structure_hold:
      "দামের গঠন দুর্বল—lower high আর lower low তৈরি হচ্ছে; এখন buy না করাই ভালো।",
    bearish_regime_hold:
      "বাজারের সামগ্রিক trend bearish; নতুন long position না খুলে hold করুন।",
    confidence_capped_bearish_regime: ({ confidenceCap = 0 }) =>
      `বাজার bearish হওয়ায় evidence strength ${confidenceCap}-এ সীমিত রাখা হয়েছে।`,
    decision_engine_unavailable:
      "এই শেয়ারের decision engine পাওয়া যায়নি; আপাতত অপেক্ষা করুন।",
    unknown: "আরও পরিষ্কার সিদ্ধান্তের সারাংশ আসছে।",
  };
}

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
    contextJoiner: string;
    contextRsi: (value: string) => string;
    contextVolume: (ratio: string) => string;
    contextTrend: (value: string) => string;
    contextOpportunity: (value: number) => string;
    decisionReasons: DecisionReasonCopy;
  };
  timeline: {
    eyebrow: string;
    title: string;
    empty: string;
    templates: {
      dataQualityTime: string;
      latestTime: string;
      snapshotReadyTitle: string;
      snapshotReadyDescription: (count: number) => string;
      scanCompleteTitle: string;
      scanCompleteDescription: (count: number) => string;
      suspiciousTitle: string;
      suspiciousDescription: (count: string) => string;
      topMoverDescription: (name: string) => string;
      decisionTitle: (symbol: string, actionLabel: string) => string;
    };
  };
  insights: {
    eyebrow: string;
    title: string;
    categories: Record<InsightCategory, string>;
    blocks: {
      marketMood: {
        title: (key: MarketMoodInsightKey) => string;
        descriptions: Record<MarketMoodInsightKey, string>;
      };
      signalCoverage: {
        title: string;
        description: (signalCount: number) => string;
      };
      turnoverContext: {
        title: string;
        descriptionMissing: string;
        liquidityGuidance: Record<TurnoverLiquidityInsightKey, string>;
        descriptionAvailable: (
          context: TurnoverInsightContext,
          liquidityLabel: string,
          guidance: string,
        ) => string;
      };
      partialData: {
        title: string;
        description: string;
      };
    };
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
    provisional: (sessionDate: string) => string;
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
      confidence: (value) => `${value}/100 evidence`,
      risk: (value) => `${value} risk`,
      awaitingContext: "Awaiting stronger context",
      contextJoiner: " · ",
      contextRsi: (value) => `RSI ${value}`,
      contextVolume: (ratio) => `Volume ${ratio}x avg`,
      contextTrend: (value) => `Trend ${value}`,
      contextOpportunity: (value) => `Opportunity ${value}`,
      decisionReasons: buildEnglishDecisionReasons(),
    },
    timeline: {
      eyebrow: "Market Timeline",
      title: "Events and operating context",
      empty: "Timeline events will appear after the next market scan.",
      templates: {
        dataQualityTime: "Data quality",
        latestTime: "Latest",
        snapshotReadyTitle: "Market snapshot ready",
        snapshotReadyDescription: (count) =>
          `${count} active instruments in the latest price snapshot.`,
        scanCompleteTitle: "Market scan complete",
        scanCompleteDescription: (count) =>
          `${count} active instruments were evaluated with the shared trader decision engine.`,
        suspiciousTitle: "Suspicious activity flagged",
        suspiciousDescription: (count) =>
          `${count} instruments need source validation before acting on signals.`,
        topMoverDescription: (name) => `Top session mover in the latest snapshot (${name}).`,
        decisionTitle: (symbol, actionLabel) => `${symbol} ${actionLabel}`,
      },
    },
    insights: {
      eyebrow: "Insights",
      title: "Deterministic  intelligence",
      categories: {
        warning: "warning",
        opportunity: "opportunity",
        momentum: "momentum",
        accumulation: "accumulation",
        volatility: "volatility",
        valuation: "valuation",
        risk: "risk",
        quality: "quality",
      },
      blocks: {
        marketMood: {
          title: (key) =>
            ({
              accumulation: "Accumulation market tone",
              bullish: "Bullish market tone",
              bearish: "Bearish market tone",
              high_volatility: "High volatility market tone",
              weak_recovery: "Weak recovery market tone",
              cautious: "Cautious market tone",
            })[key],
          descriptions: {
            accumulation:
              "Positive breadth is pairing with stronger participation; prioritize liquid continuation setups.",
            bullish: "Breadth and price action lean constructive for the latest available session.",
            bearish: "Decliners are leading, so opportunity cards should be checked against risk first.",
            high_volatility:
              "Volatility is elevated; position sizing and data quality checks matter more than headline direction.",
            weak_recovery:
              "The market is attempting to recover, but breadth confirmation is still weak.",
            cautious: "Market direction is mixed; confirmation matters more than headline movement.",
          },
        },
        signalCoverage: {
          title: "Signal layer ready",
          description: (signalCount) =>
            `${signalCount} highlighted signals include heuristic evidence and risk metadata.`,
        },
        turnoverContext: {
          title: "Turnover context",
          descriptionMissing:
            "Turnover data is unavailable. Do not treat this as zero market activity—it may be a data sync or availability issue.",
          liquidityGuidance: {
            strong_liquidity:
              "Liquid names can carry trends more reliably—prioritize them for new entries.",
            average_liquidity:
              "Participation is in line with recent norms—wait for cleaner confirmation before sizing up.",
            weak_liquidity:
              "Thin participation raises slippage risk—reduce size and favor higher-turnover names.",
          },
          descriptionAvailable: (context, liquidityLabel, guidance) => {
            const sessionChange =
              context.vsYesterday !== "N/A" ? ` (${context.vsYesterday} vs prior session)` : "";
            const averageContext =
              context.vs30DayAvg !== "N/A" ? `30-session avg is ${context.vs30DayAvg}. ` : "";
            return `Latest turnover is ${context.turnoverLabel}${sessionChange}. ${averageContext}${liquidityLabel} ${guidance}`;
          },
        },
        partialData: {
          title: "Data quality caution",
          description:
            "Some market fields are partial or validation-only, so the UI should avoid false precision.",
        },
      },
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
      provisional: (sessionDate) =>
        `Live snapshot is provisional; canonical decisions use ${sessionDate}.`,
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
      confidence: (value) => `${value}/100 evidence`,
      risk: (value) => `${value} risk`,
      awaitingContext: "আরও পরিষ্কার context দরকার",
      contextJoiner: " · ",
      contextRsi: (value) => `RSI ${value}`,
      contextVolume: (ratio) => `Volume স্বাভাবিকের তুলনায় ${ratio} গুণ`,
      contextTrend: (value) => `Trend ${value}`,
      contextOpportunity: (value) => `Opportunity ${value}`,
      decisionReasons: buildBanglaDecisionReasons(),
    },
    timeline: {
      eyebrow: "বাজার টাইমলাইন",
      title: "আজ বাজারে কী ঘটছে",
      empty: "নতুন event এলে এখানে দেখা যাবে",
      templates: {
        dataQualityTime: "তথ্যের মান",
        latestTime: "সর্বশেষ",
        snapshotReadyTitle: "বাজারের স্ন্যাপশট প্রস্তুত",
        snapshotReadyDescription: (count) =>
          `সর্বশেষ price snapshot-এ ${count}টি সক্রিয় শেয়ার আছে।`,
        scanCompleteTitle: "বাজার স্ক্যান সম্পন্ন",
        scanCompleteDescription: (count) =>
          `সাধারণ trader decision engine দিয়ে ${count}টি সক্রিয় শেয়ার বিশ্লেষণ করা হয়েছে।`,
        suspiciousTitle: "সন্দেহজনক লেনদেন চিহ্নিত",
        suspiciousDescription: (count) =>
          `${count}টি শেয়ারের উৎস যাচাই করা দরকার; signal অনুযায়ী সিদ্ধান্ত নেওয়ার আগে নিশ্চিত হোন।`,
        topMoverDescription: (name) =>
          `সর্বশেষ snapshot-এ আজকের সবচেয়ে বড় mover (${name})।`,
        decisionTitle: (symbol, actionLabel) => `${symbol} ${actionLabel}`,
      },
    },
    insights: {
      eyebrow: "Insights",
      title: "বাজার কী বলছে",
      categories: {
        warning: "সতর্কতা",
        opportunity: "সুযোগ",
        momentum: "momentum",
        accumulation: "accumulation",
        volatility: "volatility",
        valuation: "valuation",
        risk: "ঝুঁকি",
        quality: "ডেটার মান",
      },
      blocks: {
        marketMood: {
          title: (key) =>
            ({
              accumulation: "বাজারে কেনার আগ্রহ",
              bullish: "বাজার ঊর্ধ্বমুখী",
              bearish: "বাজার নিম্নমুখী",
              high_volatility: "বাজারে ওঠানামা বেশি",
              weak_recovery: "বাজার ঘুরে দাঁড়ানোর চেষ্টা",
              cautious: "বাজারে সতর্কতা",
            })[key],
          descriptions: {
            accumulation:
              "Breadth ভালো এবং participation বাড়ছে—ভালো liquidity থাকা stock-এর trend চলার সুযোগ আগে দেখুন।",
            bullish: "Breadth ও price action দুটোই ভালো; সর্বশেষ session-এ বাজারের momentum ঊর্ধ্বমুখী।",
            bearish: "Decliner বেশি; তাই opportunity দেখার আগে risk যাচাই করে নিন।",
            high_volatility:
              "Volatility বেশি; বাজারের দিকের চেয়ে position sizing আর data quality দেখা এখন বেশি জরুরি।",
            weak_recovery:
              "বাজার ঘুরে দাঁড়ানোর চেষ্টা করছে, কিন্তু Breadth এখনো recovery নিশ্চিত করছে না।",
            cautious:
              "বাজারের দিকটা mixed; headline movement-এর পেছনে না ছুটে confirmation আসা পর্যন্ত অপেক্ষা করুন।",
          },
        },
        signalCoverage: {
          title: "Signal layer তৈরি",
          description: (signalCount) =>
            `এই ${signalCount}টি signal-এর heuristic evidence ও risk দেখে কারণ বোঝা যাবে।`,
        },
        turnoverContext: {
          title: "Turnover-এর ছবি",
          descriptionMissing:
            "Turnover data এখনো পাওয়া যায়নি। বাজারে লেনদেন হয়নি ধরে নেবেন না—sync বা data availability সমস্যা হতে পারে।",
          liquidityGuidance: {
            strong_liquidity:
              "এক্ষেত্রে trend ধরে রাখার সম্ভাবনা বেশি—নতুন entry-তে এগুলো আগে দেখুন",
            average_liquidity:
              "Participation স্বাভাবিক—position বাড়ানোর আগে confirmation দেখুন",
            weak_liquidity:
              "লেনদেন কম হলে slippage ঝুঁকি বাড়ে—size কমান এবং বেশি turnover-এর stock বেছে নিন",
          },
          descriptionAvailable: (context, liquidityLabel, guidance) => {
            const sessionChange =
              context.vsYesterday !== "N/A" ? ` (গত session-এর তুলনায় ${context.vsYesterday})` : "";
            const averageContext =
              context.vs30DayAvg !== "N/A" ? `30-session গড় ${context.vs30DayAvg}। ` : "";
            return `সর্বশেষ turnover ${context.turnoverLabel}${sessionChange}। ${averageContext}${liquidityLabel}—${guidance}।`;
          },
        },
        partialData: {
          title: "ডেটা নিয়ে সতর্কতা",
          description:
            "কিছু market field এখনো অসম্পূর্ণ বা শুধু validation-এর জন্য আছে; তাই সংখ্যাগুলোকে প্রয়োজনের চেয়ে বেশি নির্ভুল ধরে নেবেন না।",
        },
      },
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
      provisional: (sessionDate) =>
        `Live snapshot provisional; canonical decision ${sessionDate} session-এর।`,
    },
  },
} as const satisfies Record<AppLocale, DashboardLanguage>;

export function getDashboardLanguage(
  locale: AppLocale,
): DashboardLanguage {
  return dashboardLanguage[locale] ?? dashboardLanguage[DEFAULT_LOCALE];
}
