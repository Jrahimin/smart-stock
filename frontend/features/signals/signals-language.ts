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
        loadingSubtitle:
          "Loading decision-ready names from the shared deterministic engine",
        readySubtitle: (count) =>
          `${count} decision-ready names from the shared deterministic engine`,
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
        emptyDescription:
          "Adjust action, risk, or symbol filters after the universe finishes loading.",
        awaitingPriceData: "Awaiting price data",
        awaitingContext: "Awaiting stronger technical context",
        decisionEngine: "Decision engine",
      },
      row: {
        confidenceAria: (value) => `${value} of 100 heuristic evidence`,
        confidence: (value) => `${value}/100 evidence`,
        risk: (label) => `${label} risk`,
        riskShort: (label) => `Risk ${label}`,
        momentum: (recommendation) =>
          recommendation === "POTENTIAL_BUY"
            ? "Entry condition available"
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
      loadingSubtitle:
        "বাজারের তথ্য দেখে সিদ্ধান্ত নেওয়ার মতো শেয়ার খোঁজা হচ্ছে",
      readySubtitle: (count) =>
        `সিদ্ধান্ত নেওয়ার মতো ${count}টি শেয়ার পাওয়া গেছে`,
      filterContextName: "signal center",
    },

    filters: {
      allActions: "সব action",
      allRisk: "সব Risk",
      lowRisk: "কম Risk",
      mediumRisk: "মাঝারি Risk",
      highRisk: "বেশি Risk",
      speculative: "বেশি ঝুঁকির",
      highestConviction: "সবচেয়ে শক্ত Signal",
      newest: "সর্বশেষ",
      riskAdjusted: "Risk বিবেচনায়",
      volumeConfirmed: "Volume-এর সাপোর্ট আছে",
    },

    states: {
      loadError: "Signal-এর তথ্য আনা যাচ্ছে না।",
      loading: "ট্রেডার সিদ্ধান্ত তৈরি হচ্ছে...",
      emptyTitle: "এই Filter-এ কোনো শেয়ার পাওয়া যায়নি",
      emptyDescription:
        "Action, Risk বা Symbol বদলে আবার দেখুন।",
      awaitingPriceData: "Price data আসছে",
      awaitingContext: "আরও পরিষ্কার Signal দরকার",
      decisionEngine: "Decision Engine",
    },

    row: {
      confidenceAria: (value) => `${value} of 100 heuristic evidence`,
      confidence: (value) => `${value}/100 evidence`,
      risk: (label) => `${label} Risk`,
      riskShort: (label) => `Risk ${label}`,
      momentum: (recommendation) =>
        recommendation === "POTENTIAL_BUY"
          ? "শর্তসাপেক্ষ entry setup আছে"
          : recommendation === "SELL"
            ? "Sell pressure বাড়ছে"
            : recommendation === "WAIT"
              ? "আরও পরিষ্কার Signal-এর অপেক্ষা"
              : "বর্তমান অবস্থান ধরে রাখুন",
    },

    signalReasons: {
      contextJoiner: dashboardSignals.contextJoiner,
      contextRsi: dashboardSignals.contextRsi,
      contextVolume: dashboardSignals.contextVolume,
      contextTrend: dashboardSignals.contextTrend,
      contextOpportunity: dashboardSignals.contextOpportunity,
      decisionReasons: dashboardSignals.decisionReasons,
    },

    localeSwitcherAria: "Signal Center-এর ভাষা",
  };
}

const signalsLanguageCache: Partial<
  Record<AppLocale, SignalsLanguage>
> = {};

export function getSignalsLanguage(
  locale: AppLocale,
): SignalsLanguage {
  const cached = signalsLanguageCache[locale];

  if (cached) {
    return cached;
  }

  const language = buildSignalsLanguage(locale);
  signalsLanguageCache[locale] = language;

  return language;
}

// Keep the default locale ready for tests and initial renders.
signalsLanguageCache[DEFAULT_LOCALE] =
  buildSignalsLanguage(DEFAULT_LOCALE);
