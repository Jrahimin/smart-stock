import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type {
  MarketAlertType,
  PulseFocusLabel,
} from "@/lib/api/backend-api-types";

export type PulseBriefingChipKey =
  | "session"
  | "active-alerts"
  | "sector-focus"
  | "in-focus";

export type PulseScoreBandLabel =
  | "strong"
  | "moderate"
  | "building"
  | "high"
  | "light"
  | "low";

export type AlertSignificance = "HIGH" | "MEDIUM" | "WATCH";

export type MarketPulseBriefingTone =
  | "positive"
  | "negative"
  | "neutral"
  | "info"
  | "warning";

export type MarketPulseLeadershipCardKind =
  | "sector"
  | "stock"
  | "accumulation";

export type MarketPulseLanguage = {
  hero: {
    eyebrow: string;
    contextAriaLabel: string;
    subline: string;
  };
  states: {
    loadingPage: string;
    unavailable: string;
    personalizationWarning: string;
    briefingPersonalizationWarning: string;
    backendError: string;
    loadingBriefing: string;
    loadingBriefingAria: string;
    emptyWaitingSnapshot: string;
    emptyInsufficientHistory: string;
    emptyNoAttention: string;
    dataQualityNote: (count: number) => string;
  };
  sinceLastVisit: {
    ariaLabel: string;
    label: string;
    changes: string;
    newFocus: string;
    alerts: string;
    summary: (
      changes: number,
      focus: number,
      alerts: number,
    ) => string;
  };
  briefing: {
    overviewAria: string;
    breadthSnapshot: string;
    breadthSnapshotAria: string;
    marketState: string;
    overallState: string;
    moneyFlow: string;
    inflowing: string;
    outflowing: string;
    opportunityScore: string;
    lastFiveSessions: string;
    yesterday: (value: number) => string;
    fiveDayAvg: (value: number) => string;
    trend: (label: string) => string;
    storyExplanation: (
      tone: MarketPulseBriefingTone,
      inflowSector: string | null,
      outflowSector: string | null,
    ) => string[];
    storyHeadline: (
      tone: MarketPulseBriefingTone,
      sectorCount: number,
    ) => string;
    storyMetricLabel: (label: string) => string;
    stateDimensionLabel: (key: string, label: string) => string;
    stateDimensionValue: (value: string) => string;
    overallStateLabel: (label: string) => string;
    opportunityTrendLabel: (label: string) => string;
    opportunityLabel: (score: number) => string;
  };
  leadership: {
    title: string;
    subtitle: string;
    freshSignals: string;
    newToday: (count: number) => string;
    upgradedToday: (count: number) => string;
    narrative: (sector: string) => string;
    cardSubtitle: (
      kind: MarketPulseLeadershipCardKind | null,
      rawSubtitle: string | null,
    ) => string | null;
  };
  summary: {
    title: string;
    tradingEnvironment: string;
    overall: string;
    readFullAnalysis: string;
    narrative: (
      tone: MarketPulseBriefingTone,
      overallLabel: string,
      sectors: string[],
    ) => string[];
    signal: (text: string) => string;
  };
  focus: {
    eyebrow: string;
    titleDefault: string;
    titleMonitorFallback: string;
    viewAll: string;
    whySelected: string;
    conviction: string;
    nextTrigger: string;
    reason: (
      reason: string,
      focusLabel: PulseFocusLabel,
    ) => string;
    actionSummary: (summary: string) => string;
    trigger: (trigger: string) => string;
  };
  alerts: {
    eyebrow: string;
    title: string;
    viewAll: string;
    significance: Record<AlertSignificance, string>;
    eventExplanation: (
      type: MarketAlertType,
      metricLabel: string,
      symbol: string | null,
    ) => string;
    whyItMatters: (type: MarketAlertType) => string;
  };
  chips: Record<PulseBriefingChipKey, string>;
  score: {
    whyScoreAria: (score: number) => string;
    whyScoreTitle: (score: number) => string;
    signalStrength: string;
    volumeExpansion: string;
    participationScore: string;
    riskLevel: string;
    bandLabels: Record<PulseScoreBandLabel, string>;
  };
  localeSwitcherAria: string;
};

const marketPulseLanguage = {
  en: {
    hero: {
      eyebrow: "Market Pulse",
      contextAriaLabel: "Today's market context",
      subline:
        "A quick read on what's moving the market and where the opportunities are.",
    },
    states: {
      loadingPage: "Loading market pulse",
      unavailable: "Market Pulse is unavailable right now.",
      personalizationWarning:
        "Personalized updates are unavailable. Showing the latest shared Market Pulse view.",
      briefingPersonalizationWarning:
        "Personalized briefing is unavailable. Showing the latest shared briefing content.",
      backendError:
        "Backend data is unavailable. Showing the latest resilient Market Pulse state.",
      loadingBriefing: "Loading market briefing",
      loadingBriefingAria: "Loading market briefing",
      emptyWaitingSnapshot:
        "Market Pulse is waiting for the next DSE snapshot.",
      emptyInsufficientHistory:
        "Not enough recent price history to rank attention reliably.",
      emptyNoAttention:
        "No stocks crossed the attention threshold yet.",
      dataQualityNote: (count) =>
        `${count} instruments flagged for data quality review.`,
    },
    sinceLastVisit: {
      ariaLabel: "Since your last visit",
      label: "Since your last visit",
      changes: "Changes",
      newFocus: "New focus",
      alerts: "Alerts",
      summary: (changes, focus, alerts) =>
        changes || focus || alerts
          ? `${changes} new changes · ${focus} new focus stocks · ${alerts} new market alerts`
          : "No new changes since your last visit",
    },
    briefing: {
      overviewAria: "Market briefing overview",
      breadthSnapshot: "Market Breadth Snapshot",
      breadthSnapshotAria: "Market breadth snapshot",
      marketState: "Market State",
      overallState: "Overall State:",
      moneyFlow: "Money Flow",
      inflowing: "Inflowing",
      outflowing: "Outflowing",
      opportunityScore: "Opportunity Score",
      lastFiveSessions: "Last 5 sessions",
      yesterday: (value) => `Yesterday: ${value}`,
      fiveDayAvg: (value) => `5-Day Avg: ${value}`,
      trend: (label) => `Trend: ${label}`,
      storyExplanation: (
        tone,
        inflowSector,
        outflowSector,
      ) => [
        tone === "positive"
          ? "Participation is improving while turnover runs above recent averages."
          : tone === "negative"
            ? "Participation remains weak while turnover stays below normal levels."
            : "Participation remains mixed while turnover stays near normal levels.",
        inflowSector
          ? `Capital continues rotating into ${inflowSector}.`
          : outflowSector
            ? `Selling pressure is visible across ${outflowSector}.`
            : "Leadership remains concentrated in a narrow set of names.",
      ],
      storyHeadline: (tone, sectorCount) => {
        if (tone === "negative") {
          return `SELLING PRESSURE BROADENING\nACROSS ${sectorCount} SECTORS`;
        }
        if (tone === "positive") {
          return `BUYING INTEREST EXPANDING\nACROSS ${sectorCount} SECTORS`;
        }
        return "MIXED MARKET WITH SELECTIVE ROTATION";
      },
      storyMetricLabel: (label) => label,
      stateDimensionLabel: (_key, label) => label,
      stateDimensionValue: (value) => value,
      overallStateLabel: (label) => label,
      opportunityTrendLabel: (label) => label,
      opportunityLabel: (score) =>
        score >= 68
          ? "Above Average Opportunity Environment"
          : score >= 55
            ? "Selective Opportunity Environment"
            : "Limited Opportunity Environment",
    },
    leadership: {
      title: "Market Leadership",
      subtitle: "Who's leading the market today.",
      freshSignals: "Fresh Signals (Buy)",
      newToday: (count) => `New Today: ${count}`,
      upgradedToday: (count) => `Upgraded Today: ${count}`,
      narrative: (sector) =>
        `Leadership remains concentrated in ${sector}.`,
      cardSubtitle: (_, rawSubtitle) => rawSubtitle,
    },
    summary: {
      title: "Market State Summary",
      tradingEnvironment: "Trading Environment",
      overall: "Overall",
      readFullAnalysis: "Read full analysis →",
      narrative: (
        tone,
        overallLabel,
        sectors,
      ) => [
        `Market remains in a ${overallLabel.toLowerCase()} phase.`,
        `${
          tone === "positive"
            ? "Leadership is broadening"
            : "Leadership remains concentrated"
        }${
          sectors.length
            ? ` in ${sectors.join(" & ")}`
            : " across selected groups"
        }. Focus on liquidity, confirmation, and disciplined position sizing.`,
      ],
      signal: (text) => text,
    },
    focus: {
      eyebrow: "Stocks In Focus",
      titleDefault: "Top opportunities worth attention",
      titleMonitorFallback:
        "Stocks approaching attention threshold",
      viewAll: "View all stocks →",
      whySelected: "Why selected?",
      conviction: "Conviction",
      nextTrigger: "Next Trigger",
      reason: (reason) => reason,
      actionSummary: (summary) => summary,
      trigger: (trigger) => trigger,
    },
    alerts: {
      eyebrow: "Market Alerts",
      title: "High priority signals for today.",
      viewAll: "View all alerts →",
      significance: {
        HIGH: "HIGH",
        MEDIUM: "MEDIUM",
        WATCH: "WATCH",
      },
      eventExplanation: () => "",
      whyItMatters: () => "",
    },
    chips: {
      session: "Market",
      "active-alerts": "Active Alerts",
      "sector-focus": "Sector In Focus",
      "in-focus": "In Focus",
    },
    score: {
      whyScoreAria: (score) => `Why score is ${score}`,
      whyScoreTitle: (score) => `Why score is ${score}`,
      signalStrength: "Signal Strength",
      volumeExpansion: "Volume Expansion",
      participationScore: "Participation Score",
      riskLevel: "Risk Level",
      bandLabels: {
        strong: "Strong",
        moderate: "Moderate",
        building: "Building",
        high: "High",
        light: "Light",
        low: "Low",
      },
    },
    localeSwitcherAria: "Market Pulse language",
  },

  bn: {
    hero: {
      eyebrow: "Market Pulse",
      contextAriaLabel: "আজকের বাজারের অবস্থা",
      subline:
        "বাজারে কী চলছে আর কোথায় সুযোগ—দ্রুত এক নজর।",
    },

    states: {
      loadingPage: "Market Pulse লোড হচ্ছে",
      unavailable:
        "Market Pulse এখন পাওয়া যাচ্ছে না।",
      personalizationWarning:
        "আপনার ব্যক্তিগত আপডেট পাওয়া যাচ্ছে না। আপাতত সবার জন্য সর্বশেষ Market Pulse দেখানো হচ্ছে।",
      briefingPersonalizationWarning:
        "আপনার ব্যক্তিগত briefing পাওয়া যাচ্ছে না। আপাতত সর্বশেষ market briefing দেখানো হচ্ছে।",
      backendError:
        "নতুন data আনা যাচ্ছে না। আপাতত সর্বশেষ পাওয়া Market Pulse দেখানো হচ্ছে।",
      loadingBriefing: "Market briefing লোড হচ্ছে",
      loadingBriefingAria:
        "Market briefing লোড হচ্ছে",
      emptyWaitingSnapshot:
        "পরের DSE update-এর অপেক্ষায় Market Pulse।",
      emptyInsufficientHistory:
        "শেয়ারগুলো ঠিকভাবে তুলনা করার মতো recent price data এখনো নেই।",
      emptyNoAttention:
        "এখনো কোনো শেয়ার বিশেষভাবে নজরে আসেনি।",
      dataQualityNote: (count) =>
        `${count}টি শেয়ারের data আবার যাচাই করা দরকার।`,
    },

    sinceLastVisit: {
      ariaLabel: "শেষবার দেখার পর",
      label: "শেষবার দেখার পর",
      changes: "পরিবর্তন",
      newFocus: "নতুন নজরে",
      alerts: "Alert",
      summary: (changes, focus, alerts) =>
        changes || focus || alerts
          ? `${changes}টি পরিবর্তন · ${focus}টি নতুন শেয়ার নজরে · ${alerts}টি নতুন alert`
          : "শেষবার দেখার পর নতুন কিছু নেই",
    },

    briefing: {
      overviewAria: "আজকের market briefing",
      breadthSnapshot: "বাজারের ভেতরের চিত্র",
      breadthSnapshotAria:
        "বাজারের ভেতরের চিত্র",
      marketState: "বাজারের অবস্থা",
      overallState: "সামগ্রিক অবস্থা:",
      moneyFlow: "টাকার প্রবাহ",
      inflowing: "টাকা ঢুকছে",
      outflowing: "টাকা বেরোচ্ছে",
      opportunityScore: "Opportunity Score",
      lastFiveSessions: "গত 5 session",
      yesterday: (value) => `গতকাল: ${value}`,
      fiveDayAvg: (value) => `5 দিনের গড়: ${value}`,
      trend: (label) => `Trend: ${label}`,
      storyExplanation: (
        tone,
        inflowSector,
        outflowSector,
      ) => [
        tone === "positive"
          ? "বাজারে অংশগ্রহণ বাড়ছে, আর লেনদেনও গড়ের চেয়ে ভালো।"
          : tone === "negative"
            ? "বাজারে অংশগ্রহণ কম, লেনদেনও স্বাভাবিকের নিচে।"
            : "বাজারে অংশগ্রহণ মিশ্র, লেনদেন মোটামুটি স্বাভাবিক।",
        inflowSector
          ? `${inflowSector}-এ টাকার প্রবাহ বাড়ছে।`
          : outflowSector
            ? `${outflowSector}-এ sell pressure দেখা যাচ্ছে।`
            : "বাজারের গতি এখনো কয়েকটি শেয়ারের ওপর বেশি নির্ভর করছে।",
      ],
      storyHeadline: (tone, sectorCount) => {
        if (tone === "negative") {
          return `বিক্রির চাপ বাড়ছে\n${sectorCount}টি সেক্টরে`;
        }
        if (tone === "positive") {
          return `কেনার আগ্রহ ছড়িয়ে পড়ছে\n${sectorCount}টি সেক্টরে`;
        }
        return "মিশ্র বাজার, বেছে বেছে rotation";
      },
      storyMetricLabel: (label) => {
        const metrics: Record<string, string> = {
          Advancing: "উঠছে",
          Declining: "নামছে",
          Unchanged: "অপরিবর্তিত",
          "Adv/Decl Ratio": "Adv/Decl Ratio",
          Turnover: "Turnover",
        };
        return metrics[label] ?? label;
      },
      stateDimensionLabel: (key, label) => {
        const labels: Record<string, string> = {
          sentiment: "Sentiment",
          participation: "Participation",
          momentum: "Momentum",
          leadership: "Leadership",
        };
        return labels[key] ?? label;
      },
      stateDimensionValue: (value) => {
        const values: Record<string, string> = {
          Bearish: "Bearish",
          Bullish: "Bullish",
          Neutral: "Neutral",
          Weak: "Weak",
          Strong: "Strong",
          Moderate: "Moderate",
          Positive: "Positive",
          Negative: "Negative",
          Narrow: "Narrow",
          Broad: "Broad",
          "Defensive Rotation": "Defensive Rotation",
          "Risk-On Expansion": "Risk-On Expansion",
          "Selective Opportunity": "Selective Opportunity",
          "Cautious Positioning": "Cautious Positioning",
        };
        return values[value] ?? value;
      },
      overallStateLabel: (label) => {
        const states: Record<string, string> = {
          "Defensive Rotation": "টাকা সুরক্ষিত জায়গায় যাচ্ছে",
          "Risk-On Expansion": "ঝুঁকি নেওয়ার মেজাজ বাড়ছে",
          "Selective Opportunity": "বেছে সুযোগ নেওয়ার সময়",
          "Cautious Positioning": "এখন একটু সতর্ক থাকা ভালো",
        };
        return states[label] ?? label;
      },
      opportunityTrendLabel: (label) => {
        const trends: Record<string, string> = {
          Improving: "উন্নতি হচ্ছে",
          Softening: "দুর্বল হচ্ছে",
          Stable: "স্থিতিশীল",
        };
        return trends[label] ?? label;
      },
      opportunityLabel: (score) =>
        score >= 68
          ? "সুযোগের পরিবেশ ভালো"
          : score >= 55
            ? "বেছে সুযোগ নেওয়ার সময়"
            : "সুযোগ কম, সাবধানে এগোন",
    },

    leadership: {
      title: "আজ কারা এগিয়ে",
      subtitle: "বাজারের নেতৃত্বে থাকা শেয়ার ও সেক্টর।",
      freshSignals: "নতুন BUY Signal",
      newToday: (count) => `আজ নতুন: ${count}`,
      upgradedToday: (count) =>
        `আজ উন্নতি হয়েছে: ${count}`,
      narrative: (sector) =>
        `আজ ${sector} সেক্টর বেশি এগিয়ে।`,
      cardSubtitle: (kind, rawSubtitle) => {
        if (kind === "sector") {
          const count =
            rawSubtitle?.match(
              /(\d+)\s+advancing stocks/i,
            )?.[1];

          return `${count ?? "কয়েকটি"}টি stock এগিয়ে`;
        }

        if (kind === "stock") {
          return "আজকের price leader";
        }

        if (kind === "accumulation") {
          return "30D average volume-এর তুলনায়";
        }

        return rawSubtitle;
      },
    },

    summary: {
      title: "আজকের বাজারের সারাংশ",
      tradingEnvironment: "ট্রেডিংয়ের পরিবেশ",
      overall: "সামগ্রিকভাবে",
      readFullAnalysis: "বিস্তারিত দেখুন →",
      narrative: (
        tone,
        overallLabel,
        sectors,
      ) => {
        const phase =
          overallLabel === "Selective Risk-On"
            ? "বেছে সুযোগ নেওয়ার মতো"
            : overallLabel === "Risk-On"
              ? "সুযোগ নেওয়ার পক্ষে"
              : overallLabel === "Cautious Positioning"
                ? "সতর্ক থাকার মতো"
                : "বেছে এগোনোর মতো";

        const leadership = sectors.length
          ? `আজ ${sectors.join(" ও ")} বেশি এগিয়ে।`
          : "বাজারের নেতৃত্ব এখনো কয়েকটি সেক্টরে সীমিত।";

        const participation =
          tone === "positive"
            ? "বাজারে অংশগ্রহণ ভালো"
            : "বাজারে অংশগ্রহণ মিশ্র";

        return [
          `বাজার এখন ${phase} অবস্থায় আছে।`,
          `${leadership} ${participation}, তাই লেনদেনের গতি, confirmation আর position size দেখে সিদ্ধান্ত নিন।`,
        ];
      },
      signal: (text) => {
        if (
          text ===
          "Opportunity environment above average"
        ) {
          return "সুযোগের পরিবেশ গড়ের চেয়ে ভালো";
        }

        if (
          text ===
          "Opportunity environment selective"
        ) {
          return "সুযোগ আছে, তবে বেছে নিতে হবে";
        }

        if (
          text ===
          "Opportunity environment limited"
        ) {
          return "সুযোগ কম, সাবধানে এগোন";
        }

        if (text === "Sector rotation active") {
          return "টাকা এক সেক্টর থেকে আরেক সেক্টরে যাচ্ছে";
        }

        if (text === "Breadth remains weak") {
          return "বেশিরভাগ শেয়ার এখনো দুর্বল";
        }

        if (
          text ===
          "Leadership remains concentrated"
        ) {
          return "বাজারের গতি কয়েকটি সেক্টরেই সীমিত";
        }

        return text;
      },
    },

    focus: {
      eyebrow: "নজরে থাকা শেয়ার",
      titleDefault: "আজ যেগুলো দেখা যেতে পারে",
      titleMonitorFallback:
        "নজরে আসার কাছাকাছি শেয়ার",
      viewAll: "সব শেয়ার দেখুন →",
      whySelected: "কেন নজরে?",
      conviction: "Signal Strength",
      nextTrigger: "পরের Trigger",
      reason: (reason, focusLabel) => {
        const confidence =
          reason.match(
            /(\d+(?:\.\d+)?)%\s*confidence/i,
          )?.[1];

        if (
          focusLabel === "New BUY Setup" &&
          confidence
        ) {
          return `BUY setup-এর confidence ${confidence}%`;
        }

        const volume =
          reason.match(/(\d+(?:\.\d+)?)x/i)?.[1];

        if (
          volume &&
          /volume/i.test(reason)
        ) {
          return `Volume স্বাভাবিকের চেয়ে ${volume}x`;
        }

        if (
          /signal upgraded to BUY/i.test(reason)
        ) {
          return "Signal আজ BUY হয়েছে";
        }

        if (/momentum improving/i.test(reason)) {
          return "Momentum বাড়ছে";
        }

        if (/moving-average/i.test(reason)) {
          return "দাম সাম্প্রতিক গড়ের ওপরে চলছে";
        }

        if (/strong volume/i.test(reason)) {
          return "Volume ভালো";
        }

        return reason;
      },

      actionSummary: (summary) => {
        const copy: Record<string, string> = {
          "Volume expanding faster than price":
            "দামের চেয়ে Volume দ্রুত বাড়ছে",

          "Participation surge needs price follow-through":
            "কেনাবেচা বেড়েছে, এখন দামের সাপোর্ট দরকার",

          "Fresh breakout from consolidation":
            "একই range থেকে price বেরিয়েছে",

          "Investigate for entry today":
            "Entry নেওয়ার আগে আজ একটু দেখে নিন",

          "Sector leadership improving":
            "সেক্টরটি আরও শক্ত হচ্ছে",

          "Signal strength upgraded today":
            "আজ Signal আরও শক্ত হয়েছে",

          "Momentum building with participation":
            "Momentum আর অংশগ্রহণ দুটোই বাড়ছে",

          "Confirm volume before acting":
            "সিদ্ধান্তের আগে Volume দেখুন",

          "Monitor for confirmation":
            "Confirmation না আসা পর্যন্ত নজরে রাখুন",

          "Watch closely today":
            "আজ একটু বেশি নজরে রাখুন",
        };

        return copy[summary] ?? summary;
      },

      trigger: (trigger) => {
        const resistance =
          trigger.match(
            /^Break above\s+(.+)$/i,
          )?.[1];

        if (resistance) {
          return `${resistance}-এর ওপরে গেলে`;
        }

        const volume =
          trigger.match(
            /^Volume stays above\s+(.+)$/i,
          )?.[1];

        if (volume) {
          return `Volume ${volume}-এর ওপরে থাকলে`;
        }

        const close =
          trigger.match(
            /^Close holds above\s+(.+)$/i,
          )?.[1];

        if (close) {
          return `Close ${close}-এর ওপরে থাকলে`;
        }

        if (
          /^RSI crosses above\s+/i.test(trigger)
        ) {
          return trigger
            .replace(
              /^RSI crosses above/i,
              "RSI",
            )
            .replace(
              /(\d+)/,
              "$1-এর ওপরে গেলে",
            );
        }

        if (
          trigger ===
          "Price confirms BUY setup"
        ) {
          return "Price BUY setup confirm করলে";
        }

        if (
          trigger ===
          "Momentum holds with positive participation"
        ) {
          return "Momentum ও কেনার চাপ ঠিক থাকলে";
        }

        return trigger;
      },
    },

    alerts: {
      eyebrow: "Market Alerts",
      title: "আজ যেগুলো বেশি গুরুত্বপূর্ণ",
      viewAll: "সব alert দেখুন →",
      significance: {
        HIGH: "জরুরি",
        MEDIUM: "গুরুত্বপূর্ণ",
        WATCH: "নজরে রাখুন",
      },

      eventExplanation: (
        type,
        metricLabel,
        symbol,
      ) => {
        if (type === "unusual-volume") {
          const ratio =
            metricLabel.match(
              /(\d+(?:\.\d+)?)x/i,
            )?.[1];

          return ratio
            ? `Volume স্বাভাবিকের চেয়ে ${ratio}x বেশি।`
            : "স্বাভাবিকের চেয়ে বেশি Volume দেখা যাচ্ছে।";
        }

        if (type === "momentum-reversal") {
          return "দুর্বল Trend-এর মধ্যে recovery দেখা যাচ্ছে।";
        }

        if (type === "liquidity-surge") {
          return "আজ লেনদেনের পরিমাণ অনেক বেড়েছে।";
        }

        if (type === "sector-rotation") {
          return "একই সেক্টরের একাধিক শেয়ারে নড়াচড়া দেখা যাচ্ছে।";
        }

        if (type === "pulse-score-jump") {
          return `${symbol ?? "এই শেয়ারের"} attention score দ্রুত বেড়েছে।`;
        }

        return "নতুন market signal দেখা গেছে।";
      },

      whyItMatters: (type) => {
        if (type === "unusual-volume") {
          return "বড় বিনিয়োগকারীদের আগ্রহ বাড়ার ইঙ্গিত হতে পারে।";
        }

        if (type === "momentum-reversal") {
          return "Volume সঙ্গে থাকলে sell pressure কমতে পারে।";
        }

        if (type === "liquidity-surge") {
          return "বড় কেনাবেচা বা exit pressure-এর ইঙ্গিত হতে পারে।";
        }

        if (type === "sector-rotation") {
          return "Movement একটি শেয়ারে সীমিত নয়, পুরো সেক্টরে ছড়াচ্ছে।";
        }

        if (type === "pulse-score-jump") {
          return "Score দ্রুত বাড়লে শেয়ারটি নতুন করে নজরে আসতে পারে।";
        }

        return "Signal-টি নজরে রাখা দরকার।";
      },
    },

    chips: {
      session: "বাজার",
      "active-alerts": "সক্রিয় Alert",
      "sector-focus": "ফোকাস সেক্টর",
      "in-focus": "নজরে",
    },

    score: {
      whyScoreAria: (score) =>
        `Score ${score} হওয়ার কারণ`,
      whyScoreTitle: (score) =>
        `Score ${score} কেন`,
      signalStrength: "Signal কতটা শক্ত",
      volumeExpansion: "Volume কতটা বেড়েছে",
      participationScore: "অংশগ্রহণের Score",
      riskLevel: "ঝুঁকির মাত্রা",
      bandLabels: {
        strong: "শক্ত",
        moderate: "মাঝারি",
        building: "বাড়ছে",
        high: "বেশি",
        light: "হালকা",
        low: "কম",
      },
    },

    localeSwitcherAria:
      "Market Pulse-এর ভাষা",
  },
} as const satisfies Record<
  AppLocale,
  MarketPulseLanguage
>;

export function getMarketPulseLanguage(
  locale: AppLocale,
): MarketPulseLanguage {
  return (
    marketPulseLanguage[locale] ??
    marketPulseLanguage[DEFAULT_LOCALE]
  );
}

export function localizePulseBriefingChips(
  chips: Array<{
    id: string;
    label: string;
    value: string;
    tone:
      | "positive"
      | "warning"
      | "info"
      | "primary";
  }>,
  locale: AppLocale,
) {
  if (locale === "en") {
    return chips;
  }

  const language =
    getMarketPulseLanguage(locale);

  return chips.map((chip) => {
    const key =
      chip.id as PulseBriefingChipKey;

    const localizedLabel =
      language.chips[key];

    return localizedLabel
      ? {
          ...chip,
          label: localizedLabel,
        }
      : chip;
  });
}