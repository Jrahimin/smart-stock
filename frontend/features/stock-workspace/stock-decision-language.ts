import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type {
  DecisionSignal,
  DecisionSignalKey,
  StockDecisionViewModel,
} from "@/features/stock-workspace/view-models/stock-decision-view-model";

export type SmartWarningCode =
  | "near_resistance"
  | "possible_corporate_action"
  | "below_support"
  | "rsi_overheated"
  | "weak_momentum"
  | "weak_volume"
  | "volume_not_confirming"
  | "overextended"
  | "high_volatility"
  | "thin_liquidity"
  | "category_z"
  | "category_n"
  | "stale_data"
  | "sparse_data"
  | "elevated_risk"
  | "bearish_pattern"
  | "near_support";

type WarningTemplate = string | ((params: Record<string, string | number>) => string);

export type StockDecisionLanguage = {
  signals: Record<Exclude<DecisionSignalKey, "warning_ref">, string>;
  warnings: Record<SmartWarningCode, { title: WarningTemplate; message: WarningTemplate }>;
  scoreLabels: Record<string, string>;
  riskLabels: Record<string, string>;
  liquidityLabels: Record<string, string>;
  freshness: {
    stale: string;
    sparse: string;
    fresh: string;
    unavailable: string;
    helper: (candles: number, tradeDate: string) => string;
    volumeRatio: (ratio: string) => string;
    unavailableShort: string;
  };
};

const stockDecisionLanguage = {
  en: {
    signals: {
      uptrend_intact: "Uptrend intact",
      trend_under_pressure: "Trend under pressure",
      momentum_healthy: "Momentum healthy",
      momentum_fading: "Momentum fading",
      volume_above_average: "Volume above average",
      weak_volume_confirmation: "Weak volume confirmation",
    },
    warnings: {
      near_resistance: {
        title: "Near resistance",
        message: "Price is close to recent resistance; upside may need a breakout.",
      },
      possible_corporate_action: {
        title: "Possible corporate action",
        message:
          "A sharp single-session drop may reflect an ex-dividend/bonus adjustment rather than a breakdown.",
      },
      below_support: {
        title: "Below support",
        message: "Price is trading below recent support; structure is weakened.",
      },
      rsi_overheated: {
        title: "RSI overheated",
        message: ({ rsi }) => `RSI at ${rsi} suggests extended momentum.`,
      },
      weak_momentum: {
        title: "Weak momentum",
        message: "RSI is weak while trend remains down; rebound is unconfirmed.",
      },
      weak_volume: {
        title: "Weak volume confirmation",
        message: "Latest volume is well below the recent average.",
      },
      volume_not_confirming: {
        title: "Volume not confirming",
        message: "Opportunity is present but volume has not expanded enough to confirm.",
      },
      overextended: {
        title: "Overextended price",
        message: "Price is stretched far above its recent mean; mean-reversion risk is elevated.",
      },
      high_volatility: {
        title: "High volatility",
        message: ({ volatility }) => `Recent daily volatility is ${volatility}%; reduce position size.`,
      },
      thin_liquidity: {
        title: "Thin liquidity",
        message: ({ explanation }) => String(explanation),
      },
      category_z: {
        title: "Category Z stock",
        message: "Category Z carries higher structural and speculative risk.",
      },
      category_n: {
        title: "Category N stock",
        message: "Category N stocks require stronger confirmation before entry.",
      },
      stale_data: {
        title: "Stale price data",
        message: "Latest OHLCV is older than the freshness threshold.",
      },
      sparse_data: {
        title: "Sparse OHLCV history",
        message: "Insufficient price history reduces confidence in technical conclusions.",
      },
      elevated_risk: {
        title: "Elevated risk profile",
        message: ({ riskLabel }) => `Risk level is ${riskLabel}; use conservative sizing.`,
      },
      bearish_pattern: {
        title: ({ confirmed }) => (confirmed ? "Bearish pattern confirmed" : "Bearish pattern forming"),
        message: ({ patternName, confirmed }) =>
          confirmed
            ? `${patternName} has confirmed; downside risk is elevated until invalidated.`
            : `${patternName} suggests downside risk until invalidated.`,
      },
      near_support: {
        title: "Near support",
        message: "Price is near support; watch for bounce or breakdown.",
      },
    },
    scoreLabels: {
      trend: "Trend",
      momentum: "Momentum",
      volume: "Volume",
      price_position: "Price Position",
      risk_penalty: "Risk Penalty",
      volatility: "Volatility",
      category: "Category",
      liquidity: "Liquidity",
      data_quality: "Data Quality",
      gap_risk: "Gap Risk",
    },
    riskLabels: {
      LOW: "LOW",
      MEDIUM: "MEDIUM",
      HIGH: "HIGH",
      SPECULATIVE: "SPECULATIVE",
    },
    liquidityLabels: {
      STRONG: "STRONG",
      NORMAL: "NORMAL",
      THIN: "THIN",
      ILLIQUID: "ILLIQUID",
    },
    freshness: {
      stale: "Stale",
      sparse: "Sparse",
      fresh: "Fresh",
      unavailable: "Unavailable",
      helper: (candles, tradeDate) => `${candles} candles · ${tradeDate}`,
      volumeRatio: (ratio) => `${ratio}x avg`,
      unavailableShort: "N/A",
    },
  },
  bn: {
    signals: {
      uptrend_intact: "Uptrend ঠিক আছে",
      trend_under_pressure: "Trend-এ চাপ পড়ছে",
      momentum_healthy: "Momentum ভালো",
      momentum_fading: "Momentum দুর্বল হচ্ছে",
      volume_above_average: "Volume গড়ের চেয়ে বেশি",
      weak_volume_confirmation: "Volume এখনো নিশ্চিত করছে না",
    },
    warnings: {
      near_resistance: {
        title: "Resistance-এর কাছে",
        message: "দাম resistance-এর কাছে; উপরে যেতে breakout দরকার হতে পারে।",
      },
      possible_corporate_action: {
        title: "Corporate action হতে পারে",
        message:
          "এক দিনের তীব্র পতন corporate action বা ex-date adjustment-এর কারণে হতে পারে; আগে নিশ্চিত হোন।",
      },
      below_support: {
        title: "Support-এর নিচে",
        message: "দাম support-এর নিচে; গঠন দুর্বল হয়েছে।",
      },
      rsi_overheated: {
        title: "RSI বেশি উঁচু",
        message: ({ rsi }) => `RSI ${rsi}-এ আছে; momentum বেশি বেড়ে গেছে।`,
      },
      weak_momentum: {
        title: "Momentum দুর্বল",
        message: "Trend নিচে থাকায় RSI দুর্বল; recovery এখনো নিশ্চিত নয়।",
      },
      weak_volume: {
        title: "Volume দুর্বল",
        message: "সর্বশেষ Volume সাম্প্রতিক গড়ের চেয়ে অনেক কম।",
      },
      volume_not_confirming: {
        title: "Volume এখনো সঙ্গ দিচ্ছে না",
        message: "সুযোগ আছে, কিন্তু Volume এখনো যথেষ্ট বাড়েনি।",
      },
      overextended: {
        title: "দাম বেশি বেড়ে গেছে",
        message: "দাম সাম্প্রতিক গড়ের চেয়ে অনেক উপরে; ফিরে আসার ঝুঁকি আছে।",
      },
      high_volatility: {
        title: "দামের ওঠানামা বেশি",
        message: ({ volatility }) =>
          `সাম্প্রতিক daily volatility ${volatility}%; position size কম রাখা ভালো।`,
      },
      thin_liquidity: {
        title: "Liquidity কম",
        message: "লেনদেন কম; বড় order fill করা কঠিন হতে পারে।",
      },
      category_z: {
        title: "Category Z শেয়ার",
        message: "Category Z-তে ঝুঁকি বেশি; সাবধানে এগোন।",
      },
      category_n: {
        title: "Category N শেয়ার",
        message: "Category N-এ entry নেওয়ার আগে ভালো confirmation দরকার।",
      },
      stale_data: {
        title: "দামের তথ্য পুরনো",
        message: "সর্বশেষ OHLCV আর তাজা নয়।",
      },
      sparse_data: {
        title: "Price history কম",
        message: "যথেষ্ট price history নেই; technical সিদ্ধান্তে confidence কম।",
      },
      elevated_risk: {
        title: "ঝুঁকি বেশি",
        message: ({ riskLabel }) => `ঝুঁকির মাত্রা ${riskLabel}; position size ছোট রাখুন।`,
      },
      bearish_pattern: {
        title: ({ confirmed }) => (confirmed ? "Bearish pattern নিশ্চিত" : "Bearish pattern তৈরি হচ্ছে"),
        message: ({ patternName, confirmed }) =>
          confirmed
            ? `${patternName} confirm হয়েছে; নিচের দিকে ঝুঁকি বেশি।`
            : `${patternName} নিচের দিকে ঝুঁকির ইঙ্গিত দিচ্ছে।`,
      },
      near_support: {
        title: "Support-এর কাছে",
        message: "দাম support-এর কাছে; bounce না breakdown—দুটোই দেখুন।",
      },
    },
    scoreLabels: {
      trend: "Trend",
      momentum: "Momentum",
      volume: "Volume",
      price_position: "দামের অবস্থান",
      risk_penalty: "ঝুঁকির কারণে কমেছে",
      volatility: "দামের ওঠানামা",
      category: "Category",
      liquidity: "Liquidity",
      data_quality: "Data Quality",
      gap_risk: "Gap ঝুঁকি",
    },
    riskLabels: {
      LOW: "কম",
      MEDIUM: "মাঝারি",
      HIGH: "উচ্চ",
      SPECULATIVE: "Speculative",
    },
    liquidityLabels: {
      STRONG: "শক্তিশালী",
      NORMAL: "স্বাভাবিক",
      THIN: "কম",
      ILLIQUID: "খুব কম",
    },
    freshness: {
      stale: "পুরনো",
      sparse: "তথ্য কম",
      fresh: "তাজা",
      unavailable: "পাওয়া যায়নি",
      helper: (candles, tradeDate) => `${candles}টি candle · ${tradeDate}`,
      volumeRatio: (ratio) => `গড়ের ${ratio}x`,
      unavailableShort: "N/A",
    },
  },
} as const satisfies Record<AppLocale, StockDecisionLanguage>;

export function getStockDecisionLanguage(locale: AppLocale): StockDecisionLanguage {
  return stockDecisionLanguage[locale] ?? stockDecisionLanguage[DEFAULT_LOCALE];
}

function resolveTemplate(
  template: WarningTemplate,
  params: Record<string, string | number | boolean>,
): string {
  return typeof template === "function" ? template(params) : template;
}

function extractWarningParams(
  code: SmartWarningCode,
  warning: { title: string; message: string },
): Record<string, string | number | boolean> {
  if (code === "rsi_overheated") {
    const rsi = warning.message.match(/RSI at ([\d.]+)/i)?.[1] ?? warning.message.match(/([\d.]+)/)?.[1];
    return { rsi: rsi ?? "" };
  }
  if (code === "high_volatility") {
    const volatility = warning.message.match(/([\d.]+)%/)?.[1];
    return { volatility: volatility ?? "" };
  }
  if (code === "elevated_risk") {
    const riskLabel = warning.message.match(/Risk level is ([A-Z]+)/i)?.[1] ?? "HIGH";
    return { riskLabel };
  }
  if (code === "bearish_pattern") {
    const confirmed = warning.title.toLowerCase().includes("confirmed");
    const patternName = warning.message.split(" has confirmed")[0]?.split(" suggests")[0] ?? warning.title;
    return { patternName, confirmed };
  }
  if (code === "thin_liquidity") {
    return { explanation: warning.message };
  }
  return {};
}

export function localizeSmartWarning(
  warning: { code: string; title: string; message: string },
  locale: AppLocale,
): { title: string; message: string; severity: string; code: string } {
  if (locale === "en") {
    return warning as { title: string; message: string; severity: string; code: string };
  }

  const language = getStockDecisionLanguage(locale);
  const copy = language.warnings[warning.code as SmartWarningCode];
  if (!copy) {
    return warning as { title: string; message: string; severity: string; code: string };
  }

  const params = extractWarningParams(warning.code as SmartWarningCode, warning);
  return {
    ...warning,
    title: resolveTemplate(copy.title, params),
    message: resolveTemplate(copy.message, params),
  };
}

export function applyStockDecisionLocalization(
  model: StockDecisionViewModel,
  locale: AppLocale,
): StockDecisionViewModel {
  if (!model.available || locale === "en") {
    return model;
  }

  const language = getStockDecisionLanguage(locale);

  const localizeComponent = (component: { key: string; label: string; score: number; explanation: string }) => ({
    ...component,
    label: language.scoreLabels[component.key] ?? component.label,
  });

  const localizedWarnings = model.warnings.map((warning) => localizeSmartWarning(warning, locale));
  const volumeRatioMatch = model.liquidity.volumeRatio.match(/^([\d.]+)x/i);

  return {
    ...model,
    decisionSignals: model.decisionSignals.map((signal) => ({
      ...signal,
      text:
        signal.key === "warning_ref" && signal.warningCode
          ? localizedWarnings.find((warning) => warning.code === signal.warningCode)?.title ?? signal.text
          : language.signals[signal.key as Exclude<DecisionSignalKey, "warning_ref">] ?? signal.text,
    })),
    opportunityComponents: model.opportunityComponents.map(localizeComponent),
    riskComponents: model.riskComponents.map(localizeComponent),
    riskLabel: language.riskLabels[model.riskLabel] ?? model.riskLabel,
    liquidity: {
      ...model.liquidity,
      label: language.liquidityLabels[model.liquidity.label] ?? model.liquidity.label,
      volumeRatio: volumeRatioMatch
        ? language.freshness.volumeRatio(volumeRatioMatch[1])
        : language.freshness.unavailableShort,
    },
    warnings: localizedWarnings,
    topWarnings: model.topWarnings.map((warning) =>
      localizedWarnings.find((localized) => localized.code === warning.code) ??
      localizeSmartWarning(warning, locale),
    ),
    freshness: {
      ...model.freshness,
      label:
        model.freshness.label === "Stale"
          ? language.freshness.stale
          : model.freshness.label === "Sparse"
            ? language.freshness.sparse
            : model.freshness.label === "Fresh"
              ? language.freshness.fresh
              : model.freshness.label === "Unavailable"
                ? language.freshness.unavailable
                : model.freshness.label,
      helper: model.freshness.helper.includes("candles")
        ? language.freshness.helper(
            Number(model.freshness.helper.match(/^(\d+)/)?.[1] ?? 0),
            model.freshness.helper.split("·")[1]?.trim() ?? "unknown",
          )
        : model.freshness.helper,
    },
  };
}
