import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { getDashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { DecisionReasonCopy } from "@/lib/market/trader-decision-reason";

export type SignalsLanguage = {
  hero: {
    eyebrow: string;
    title: string;
    loadingSubtitle: string;
    readySubtitle: (count: number) => string;
    filterContextName: string;
  };
  filters: {
    allActions: string;
    allRisk: string;
    lowRisk: string;
    mediumRisk: string;
    highRisk: string;
    speculative: string;
    highestConviction: string;
    newest: string;
    riskAdjusted: string;
    volumeConfirmed: string;
  };
  states: {
    loadError: string;
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    awaitingPriceData: string;
    awaitingContext: string;
    decisionEngine: string;
  };
  row: {
    confidenceAria: (value: number) => string;
    confidence: (value: number) => string;
    risk: (label: string) => string;
    riskShort: (label: string) => string;
    momentum: (recommendation: string) => string;
  };
  signalReasons: {
    contextJoiner: string;
    contextRsi: (value: string) => string;
    contextVolume: (ratio: string) => string;
    contextTrend: (value: string) => string;
    contextOpportunity: (value: number) => string;
    decisionReasons: DecisionReasonCopy;
  };
  localeSwitcherAria: string;
};

function buildSignalsLanguage(locale: AppLocale): SignalsLanguage {
  const dashboardSignals = getDashboardLanguage(locale).signals;

  if (locale === "en") {
    return {
      hero: {
        eyebrow: "Signal Center",
        title: "Explanation-first trader decisions",
        loadingSubtitle: "Loading decision-ready names from the shared deterministic engine",
        readySubtitle: (count) => `${count} decision-ready names from the shared deterministic engine`,
        filterContextName: "signal center",
      },
      filters: {
        allActions: "All actions",
        allRisk: "All risk",
        lowRisk: "Low risk",
        mediumRisk: "Medium risk",
        highRisk: "High risk",
        speculative: "Speculative",
        highestConviction: "Highest conviction",
        newest: "Newest/as-of",
        riskAdjusted: "Risk-adjusted",
        volumeConfirmed: "Volume-confirmed",
      },
      states: {
        loadError: "Could not load signal data.",
        loading: "Loading trader decisions...",
        emptyTitle: "No decision-ready names match these filters",
        emptyDescription: "Adjust action, risk, or symbol filters after the universe finishes loading.",
        awaitingPriceData: "Awaiting price data",
        awaitingContext: "Awaiting stronger technical context",
        decisionEngine: "Decision engine",
      },
      row: {
        confidenceAria: (value) => `${value}% confidence`,
        confidence: (value) => `${value}% confidence`,
        risk: (label) => `${label} risk`,
        riskShort: (label) => `Risk ${label}`,
        momentum: (recommendation) =>
          recommendation === "BUY"
            ? "Momentum expanding"
            : recommendation === "SELL"
              ? "Pressure rising"
              : recommendation === "WAIT"
                ? "Wait for confirmation"
                : "Hold existing view",
      },
      signalReasons: {
        contextJoiner: dashboardSignals.contextJoiner,
        contextRsi: dashboardSignals.contextRsi,
        contextVolume: dashboardSignals.contextVolume,
        contextTrend: dashboardSignals.contextTrend,
        contextOpportunity: dashboardSignals.contextOpportunity,
        decisionReasons: dashboardSignals.decisionReasons,
      },
      localeSwitcherAria: "Signal Center language",
    };
  }

  return {
    hero: {
      eyebrow: "Signal Center",
      title: "ব্যাখ্যাসহ ট্রেডার সিদ্ধান্ত",
      loadingSubtitle: "deterministic engine থেকে সিদ্ধান্তের জন্য প্রস্তুত শেয়ার লোড হচ্ছে",
      readySubtitle: (count) => `deterministic engine থেকে ${count}টি সিদ্ধান্ত-প্রস্তুত শেয়ার`,
      filterContextName: "signal center",
    },
    filters: {
      allActions: "সব action",
      allRisk: "সব ঝুঁকি",
      lowRisk: "কম ঝুঁকি",
      mediumRisk: "মাঝারি ঝুঁকি",
      highRisk: "উচ্চ ঝুঁকি",
      speculative: "Speculative",
      highestConviction: "সর্বোচ্চ conviction",
        newest: "সর্বশেষ তারিখ",
        riskAdjusted: "ঝুঁকি অনুযায়ী",
        volumeConfirmed: "Volume দিয়ে নিশ্চিত",
    },
    states: {
      loadError: "Signal ডেটা আনা যাচ্ছে না।",
      loading: "ট্রেডার সিদ্ধান্ত লোড হচ্ছে...",
      emptyTitle: "এই ফিল্টারে কোনো সিদ্ধান্ত-প্রস্তুত নাম নেই",
      emptyDescription: "Universe লোড হওয়ার পর action, ঝুঁকি বা symbol ফিল্টার বদলিয়ে দেখুন।",
      awaitingPriceData: "দামের ডেটা আসছে",
      awaitingContext: "আরও শক্তিশালী technical context আসছে",
      decisionEngine: "Decision engine",
    },
      row: {
        confidenceAria: (value) => `${value}% confidence`,
        confidence: (value) => `${value}% confidence`,
        risk: (label) => `${label} risk`,
        riskShort: (label) => `Risk ${label}`,
        momentum: (recommendation) =>
          recommendation === "BUY"
            ? "Momentum বাড়ছে"
            : recommendation === "SELL"
              ? "চাপ বাড়ছে"
              : recommendation === "WAIT"
                ? "Confirmation-এর অপেক্ষা করুন"
                : "আগের view ধরে রাখুন",
    },
    signalReasons: {
      contextJoiner: dashboardSignals.contextJoiner,
      contextRsi: dashboardSignals.contextRsi,
      contextVolume: dashboardSignals.contextVolume,
      contextTrend: dashboardSignals.contextTrend,
      contextOpportunity: dashboardSignals.contextOpportunity,
      decisionReasons: dashboardSignals.decisionReasons,
    },
    localeSwitcherAria: "Signal Center ভাষা",
  };
}

const signalsLanguageCache: Partial<Record<AppLocale, SignalsLanguage>> = {};

export function getSignalsLanguage(locale: AppLocale): SignalsLanguage {
  const cached = signalsLanguageCache[locale];
  if (cached) {
    return cached;
  }

  const language = buildSignalsLanguage(locale);
  signalsLanguageCache[locale] = language;
  return language;
}

// Ensure default locale is always available without lazy init gaps in tests.
signalsLanguageCache[DEFAULT_LOCALE] = buildSignalsLanguage(DEFAULT_LOCALE);
signalsLanguageCache.en = buildSignalsLanguage("en");
