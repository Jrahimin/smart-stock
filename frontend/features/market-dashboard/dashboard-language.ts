import { evidenceLabel } from "@/lib/market/decision-presentation";
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
  averageSessions?: number;
  turnoverLabel: string;
  vsYesterday: string;
  vs30DayAvg: string;
  liquidityKey: TurnoverLiquidityInsightKey;
  intraday?: boolean;
};

function buildEnglishDecisionReasons(): DecisionReasonCopy {
  return {
    stale_sparse_data: "Data is stale or sparse; wait for fresher confirmation.",
    corporate_action_adjustment:
      "Sharp single-session drop looks like a corporate-action/ex-date adjustment rather than a breakdown; wait for confirmation.",
    failed_support: "Price has failed recent support.",
    support_break: "Price has failed recent support on eligible data.",
    data_not_eligible:
      "Data is not eligible for a fresh directional decision; wait for review or refresh.",
    buy_uptrend_reward: "Uptrend with favorable opportunity and acceptable reward potential.",
    buy_uptrend_resistance_test:
      "Uptrend with favorable opportunity and resistance test participation.",
    uptrend_near_resistance_wait_volume:
      "Uptrend is constructive near resistance; wait for stronger volume confirmation.",
    high_risk_selective_setup:
      "High-risk name with strong trend and participation; treat as a selective setup.",
    bearish_structure: "Bearish structure dominates the setup.",
    bearish_directional_evidence:
      "Reliable bearish trend and momentum evidence supports exit or avoidance.",
    risk_wait_confirmation: ({ riskLabel }) => riskLabel ? `Risk level is ${riskLabel}; wait for cleaner confirmation rather than forcing a trade.` : "The published risk constraint calls for cleaner confirmation.",
    fresh_entry_risk_block: ({ riskLabel = "elevated" }) =>
      `Trading risk is ${riskLabel} or tradability is inadequate; wait rather than forcing a fresh entry.`,
    entry_plan_not_valid:
      "Bullish evidence lacks a safe actionable entry plan; non-holders should wait.",
    momentum_extended_wait_entry:
      "Momentum is extended near resistance; wait for a better entry.",
    momentum_elevated_hold:
      "Momentum is elevated but the uptrend remains intact; hold rather than chase.",
    extended_momentum:
      "Momentum is extended; holders may hold while non-holders wait for a better entry.",
    near_resistance_no_uptrend:
      "Price is near resistance without an uptrend; wait for confirmation.",
    near_resistance_constructive:
      "The setup is constructive near resistance; wait for a confirmed price break.",
    constructive_hold:
      "Structure remains constructive; hold existing positions or wait for cleaner entry.",
    constructive_watch:
      "Structure remains constructive; holders may hold while non-holders wait.",
    sideways_constructive_monitor:
      "Sideways base with constructive opportunity; monitor for directional confirmation.",
    no_directional_edge: "No strong directional edge is present; patience is preferred.",
    reward_risk_below_minimum: "The planned reward per unit of risk is below the policy minimum; wait for a permitted plan.",
    lower_structure_hold:
      "Market structure shows lower highs and lower lows; hold rather than buy into weakness.",
    lower_structure_conflict:
      "Lower market structure conflicts with a fresh buy; hold rather than add exposure.",
    bearish_regime_hold:
      "Broad market regime is bearish; hold rather than open new long exposure.",
    bullish_setup_downgraded:
      "The bullish setup is constructive, but an authoritative constraint blocks a fresh entry.",
    bullish_setup_valid_entry:
      "Strong completed-session evidence aligns with a valid, meaningful entry condition.",
    bullish_setup_ready:
      "Strong completed-session evidence aligns with a valid, meaningful entry condition.",
    bullish_setup_pullback:
      "Strong completed-session evidence aligns with a valid, meaningful entry condition.",
    bullish_setup_breakout:
      "Strong completed-session evidence aligns with a valid, meaningful entry condition.",
    bullish_setup_continuation:
      "Strong completed-session evidence aligns with a valid, meaningful entry condition.",
    confidence_capped_bearish_regime: "Evidence strength is capped by the bearish market regime.",
    decision_engine_unavailable:
      "Decision engine unavailable for this row; defaulting to wait.",
    unknown: "Awaiting a clearer decision summary.",
  };
}

function banglaRiskLevel(label: string) {
  return ({ LOW: "কম", MEDIUM: "মাঝারি", HIGH: "বেশি", ELEVATED: "বাড়তি" } as Record<string, string>)[label.toUpperCase()] ?? label;
}

function buildBanglaDecisionReasons(): DecisionReasonCopy {
  return {
    stale_sparse_data: "তথ্য পুরোনো বা অসম্পূর্ণ। নতুন তথ্য দিয়ে নিশ্চিত হওয়া পর্যন্ত অপেক্ষা করুন।",
    corporate_action_adjustment:
      "এক কার্যদিবসে বড় পতনটি কোম্পানির ঘোষিত পরিবর্তন বা এক্স-ডেটের সমন্বয়ের ফল হতে পারে। পতনের কারণ নিশ্চিত হওয়া পর্যন্ত অপেক্ষা করুন।",
    failed_support: "দাম সাম্প্রতিক সমর্থনমূল্যের নিচে নেমেছে।",
    support_break: "যাচাই করা তথ্যে দাম সাম্প্রতিক সমর্থনমূল্যের নিচে নেমেছে।",
    data_not_eligible: "নতুন সিদ্ধান্তের জন্য বর্তমান তথ্য যথেষ্ট নয়। তথ্য যাচাই বা হালনাগাদ হওয়া পর্যন্ত অপেক্ষা করুন।",
    buy_uptrend_reward: "দাম ঊর্ধ্বমুখী, আর সম্ভাব্য লাভের হিসাবে সুযোগটি গ্রহণযোগ্য।",
    buy_uptrend_resistance_test: "দাম ঊর্ধ্বমুখী। বাধার কাছাকাছি দামে কেনাবেচার পরিমাণও সুযোগের পক্ষে।",
    uptrend_near_resistance_wait_volume: "দাম ঊর্ধ্বমুখী হলেও বাধার কাছাকাছি। কেনাবেচা বাড়লে আবার বিবেচনা করুন।",
    high_risk_selective_setup: "দামের গতি ও কেনাবেচা শক্তিশালী, তবে ঝুঁকি বেশি। বেছে বিবেচনা করুন।",
    bearish_structure: "দামের গতিপথে পতনের লক্ষণই বেশি।",
    bearish_directional_evidence: "দামের প্রবণতা ও গতি দুটোই নিম্নমুখী। বিক্রি বা এড়িয়ে যাওয়ার কথা ভাবুন।",
    risk_wait_confirmation: ({ riskLabel }) => riskLabel ? `ঝুঁকির মাত্রা ${banglaRiskLevel(riskLabel)}। আরও স্পষ্ট প্রমাণ না পাওয়া পর্যন্ত কেনাবেচা থেকে বিরত থাকুন।` : "প্রকাশিত ঝুঁকির সীমার কারণে আরও স্পষ্ট প্রমাণের অপেক্ষা করুন।",
    fresh_entry_risk_block: ({ riskLabel }) => riskLabel ? `ঝুঁকির মাত্রা ${banglaRiskLevel(riskLabel)} অথবা কেনাবেচার সুযোগ সীমিত। নতুন করে কেনার আগে অপেক্ষা করুন।` : "প্রকাশিত trading ঝুঁকি বা লেনদেনের সীমার কারণে নতুন entry বন্ধ।",
    entry_plan_not_valid: "দাম বাড়ার লক্ষণ আছে, তবে কেনার নিরাপদ শর্ত তৈরি হয়নি। শেয়ারটি হাতে না থাকলে অপেক্ষা করুন।",
    momentum_extended_wait_entry: "বাধার কাছাকাছি এসে দাম দ্রুত বেড়েছে। কেনার ভালো সুযোগের জন্য অপেক্ষা করুন।",
    momentum_elevated_hold: "দামের গতি শক্তিশালী এবং প্রবণতা ঊর্ধ্বমুখী। বাড়তি দামে না কিনে হাতে থাকা শেয়ার ধরে রাখুন।",
    extended_momentum: "দাম দ্রুত বেড়েছে। হাতে থাকলে ধরে রাখতে পারেন; নতুন করে কেনার আগে অপেক্ষা করুন।",
    near_resistance_no_uptrend: "দাম বাধার কাছাকাছি, কিন্তু স্পষ্ট ঊর্ধ্বমুখী প্রবণতা নেই। নিশ্চিত হওয়া পর্যন্ত অপেক্ষা করুন।",
    near_resistance_constructive: "দামের অবস্থা অনুকূল, তবে বাধার কাছাকাছি। দাম সেই সীমা পেরিয়ে টিকে থাকা পর্যন্ত অপেক্ষা করুন।",
    constructive_hold: "দামের গতিপথ অনুকূল। হাতে থাকা শেয়ার ধরে রাখুন অথবা নতুন কেনার ভালো সুযোগের জন্য অপেক্ষা করুন।",
    constructive_watch: "দামের গতি এখনও অনুকূল। হাতে থাকলে ধরে রাখতে পারেন; নতুন করে কেনার আগে অপেক্ষা করুন।",
    sideways_constructive_monitor: "দাম একটি সীমার মধ্যে স্থির হয়েছে। পরের গতিপথ পরিষ্কার হওয়া পর্যন্ত নজরে রাখুন।",
    no_directional_edge: "দাম কোন দিকে যাবে, তার স্পষ্ট লক্ষণ নেই। অপেক্ষা করুন।",
    reward_risk_below_minimum: "পরিকল্পিত লাভ-ঝুঁকির অনুপাত নীতির ন্যূনতম সীমার নিচে; অনুমোদিত পরিকল্পনার অপেক্ষা করুন।",
    lower_structure_hold: "দামের সর্বোচ্চ ও সর্বনিম্ন মান দুটোই আগের চেয়ে কমছে। নতুন করে না কিনে হাতে থাকা শেয়ার ধরে রাখুন।",
    lower_structure_conflict: "দামের গতিপথ নিচের দিকে। হাতে থাকা শেয়ার ধরে রাখুন, নতুন করে কিনবেন না।",
    bearish_regime_hold: "সামগ্রিক বাজার নিম্নমুখী। নতুন করে না কিনে হাতে থাকা শেয়ার ধরে রাখুন।",
    bullish_setup_downgraded: "দাম বাড়ার লক্ষণ আছে, তবে একটি গুরুত্বপূর্ণ শর্ত পূরণ হয়নি। নতুন করে কেনা থেকে বিরত থাকুন।",
    bullish_setup_valid_entry: "কার্যদিবসের চূড়ান্ত তথ্য কেনার শর্তকে সমর্থন করে।",
    bullish_setup_ready: "কার্যদিবসের চূড়ান্ত তথ্য কেনার শর্তকে সমর্থন করে।",
    bullish_setup_pullback: "দাম নির্ধারিত সীমায় ফিরলে কেনার শর্ত পূরণ হতে পারে।",
    bullish_setup_breakout: "দাম নির্ধারিত সীমা পেরিয়ে টিকে থাকলে কেনার কথা ভাবুন।",
    bullish_setup_continuation: "দাম পেরিয়ে যাওয়া সীমার ওপরে টিকে থাকলে সুযোগটি বিবেচনা করুন।",
    confidence_capped_bearish_regime: "বাজার নিম্নমুখী হওয়ায় প্রমাণের শক্তির score সীমিত রাখা হয়েছে।",
    decision_engine_unavailable: "এই শেয়ারের signal গণনা করা যায়নি। আপাতত অপেক্ষা করুন।",
    unknown: "সিদ্ধান্তের বিস্তারিত এখনও পাওয়া যায়নি।",
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
      strong_liquidity: "Trading activity is above its recent average.",
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
      `More stocks advanced than declined in this session (${advancing} up, ${declining} down, ${unchanged} flat).`,
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
        "Market view is warming up. This section should populate shortly.",
      confidence: (value) => evidenceLabel(value, "en"),
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
        valuation: "Trading activity",
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
            `${signalCount} highlighted signals include supporting signals and risk context.`,
        },
        turnoverContext: {
          title: "Trading activity",
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
            if (context.intraday) return `Turnover so far is BDT ${context.turnoverLabel}. The session is still open; comparisons with completed sessions are provisional.`;
            const sessionChange =
              context.vsYesterday !== "N/A" ? ` (${context.vsYesterday} vs prior session)` : "";
            const averageContext =
              context.vs30DayAvg !== "N/A" ? `${context.averageSessions ?? 30}-session avg is BDT ${context.vs30DayAvg}. ` : "";
            return `Recorded session turnover is BDT ${context.turnoverLabel}${sessionChange}. ${averageContext}${liquidityLabel} ${guidance}`;
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
        `Live snapshot is provisional; dated decisions use ${sessionDate}.`,
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
      confidence: (value) => evidenceLabel(value, "bn"),
      risk: (value) => `${value} risk`,
      awaitingContext: "আরও পরিষ্কার context দরকার",
      contextJoiner: " · ",
      contextRsi: (value) => `RSI ${value}`,
      contextVolume: (ratio) => `কেনাবেচার পরিমাণ গড়ের ${ratio} গুণ`,
      contextTrend: (value) => `দামের প্রবণতা ${value}`,
      contextOpportunity: (value) => `সুযোগের score ${value}`,
      decisionReasons: buildBanglaDecisionReasons(),
    },
    timeline: {
      eyebrow: "বাজার টাইমলাইন",
      title: "আজ বাজারে কী ঘটছে",
      empty: "নতুন event এলে এখানে দেখা যাবে",
      templates: {
        dataQualityTime: "তথ্যের মান",
        latestTime: "সর্বশেষ",
        snapshotReadyTitle: "বাজারের তথ্য প্রস্তুত",
        snapshotReadyDescription: (count) =>
          `সর্বশেষ বাজারচিত্রে ${count}টি সক্রিয় শেয়ার আছে।`,
        scanCompleteTitle: "বাজার স্ক্যান সম্পন্ন",
        scanCompleteDescription: (count) =>
          `${count}টি সক্রিয় শেয়ারের তথ্য একই নিয়মে বিশ্লেষণ করা হয়েছে।`,
        suspiciousTitle: "দামের তথ্য যাচাই প্রয়োজন",
        suspiciousDescription: (count) =>
          `${count === "Some" ? "কয়েকটি" : `${count}টি`} শেয়ারের দামের উৎস যাচাই করুন, তারপর signal বিবেচনা করুন।`,
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
        valuation: "কেনাবেচার অবস্থা",
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
              "বেশি শেয়ারের দাম বাড়ছে, কেনাবেচাও বাড়ছে। বেশি লেনদেন হয় এমন শেয়ারের দিকে নজর রাখুন।",
            bullish: "সর্বশেষ বাজারের তথ্যে শেয়ারের দাম ও বাজারের গতি ঊর্ধ্বমুখী।",
            bearish: "বেশি শেয়ারের দাম কমছে। কোনো সুযোগ বিবেচনার আগে ঝুঁকি যাচাই করুন।",
            high_volatility:
              "দামে ওঠানামা বেশি। বিনিয়োগের পরিমাণ ও তথ্যের নির্ভরযোগ্যতা যাচাই করুন।",
            weak_recovery:
              "বাজার ঘুরে দাঁড়ানোর চেষ্টা করছে, তবে এখনও অনেক শেয়ারের দাম সেই গতিকে সমর্থন করছে না।",
            cautious:
              "বাজারে মিশ্র গতি দেখা যাচ্ছে। দামের পরিবর্তন টেকসই কি না, নিশ্চিত হওয়ার অপেক্ষা করুন।",
          },
        },
        signalCoverage: {
          title: "Signal layer তৈরি",
          description: (signalCount) =>
            `এই ${signalCount}টি signal-এর বিশ্লেষণের তথ্য ও risk দেখে কারণ বোঝা যাবে।`,
        },
        turnoverContext: {
          title: "কেনাবেচার অবস্থা",
          descriptionMissing:
            "লেনদেনের মূল্যের তথ্য পাওয়া যায়নি। এটিকে শূন্য লেনদেন ধরে নেবেন না।",
          liquidityGuidance: {
            strong_liquidity:
              "বেশি লেনদেন হয় এমন শেয়ারে দামের গতি ধরে থাকার সম্ভাবনা বিবেচনা করুন",
            average_liquidity:
              "বিনিয়োগ বাড়ানোর আগে দামের গতি নিশ্চিত হওয়ার অপেক্ষা করুন",
            weak_liquidity:
              "কম লেনদেনে প্রত্যাশিত দামে কেনাবেচা করা কঠিন হতে পারে। বিনিয়োগের পরিমাণ ও শেয়ারের লেনদেন বিবেচনা করুন",
          },
          descriptionAvailable: (context, liquidityLabel, guidance) => {
            if (context.intraday) return `এখন পর্যন্ত লেনদেনের মূল্য BDT ${context.turnoverLabel}। কার্যদিবস চলছে, তাই সম্পন্ন কার্যদিবসের সঙ্গে তুলনা এখনও সাময়িক।`;
            const sessionChange =
              context.vsYesterday !== "N/A" ? ` (আগের কার্যদিবসের তুলনায় ${context.vsYesterday})` : "";
            const averageContext =
              context.vs30DayAvg !== "N/A" ? `${(context.averageSessions ?? 30).toLocaleString("en-GB")} কার্যদিবসের গড় BDT ${context.vs30DayAvg}। ` : "";
            return `দেখানো কার্যদিবসে লেনদেনের মূল্য BDT ${context.turnoverLabel}${sessionChange}। ${averageContext}${liquidityLabel}। ${guidance}।`;
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
      syncing: "হালনাগাদ হচ্ছে…",
      statusUnavailable: "হালনাগাদের তথ্য নেই",
      statusUnavailableTitle: "বাজারের তথ্য কখন হালনাগাদ হয়েছে জানা যায়নি",
      lastUpdated: (relative) => `হালনাগাদ: ${relative}`,
      noSnapshotYet: "বাজারের তথ্য এখনও আসেনি",
      lastUpdatedPending: "হালনাগাদের সময় আসছে…",
      refreshAria: "বাজারের তথ্য রিফ্রেশ করুন",
      refreshTitle: "বাজারের তথ্য রিফ্রেশ করুন",
      refreshDisabledTitle: "এই সময়ে রিফ্রেশ করা যাচ্ছে না",
      synced: (label) => `শেষ হালনাগাদ: ${label}`,
      session: (label) => label,
      nextUpdate: (label) => `পরের হালনাগাদ: ${label}`,
      provisional: (sessionDate) => `চলতি দামের তথ্য সাময়িক। চূড়ান্ত সিদ্ধান্তের কার্যদিবস: ${sessionDate}।`,
    },
  },
} as const satisfies Record<AppLocale, DashboardLanguage>;

export function getDashboardLanguage(
  locale: AppLocale,
): DashboardLanguage {
  return dashboardLanguage[locale] ?? dashboardLanguage[DEFAULT_LOCALE];
}
