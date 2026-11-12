import type { DecisionDisplayAction, HolderAction } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type SignalActionLabelCopy = {
  default: Record<DecisionDisplayAction, string>;
  compact: Partial<Record<DecisionDisplayAction, string>>;
};

const signalActionLabels: Record<AppLocale, SignalActionLabelCopy> = {
  en: {
    default: {
      POTENTIAL_BUY: "POTENTIAL BUY",
      WAIT: "WAIT",
      SELL: "SELL",
      HOLD: "HOLD",
    },
    compact: {
      POTENTIAL_BUY: "P. BUY",
    },
  },
  bn: {
    default: {
      POTENTIAL_BUY: "কেনার সম্ভাবনা",
      WAIT: "অপেক্ষা করুন",
      SELL: "বিক্রি করুন",
      HOLD: "ধরে রাখুন",
    },
    compact: {
      POTENTIAL_BUY: "কেনার সম্ভাবনা",
    },
  },
};

export function getSignalActionLabel(
  signal: DecisionDisplayAction,
  locale: AppLocale = DEFAULT_LOCALE,
  density: "default" | "compact" = "default",
): string {
  const copy = signalActionLabels[locale] ?? signalActionLabels[DEFAULT_LOCALE];

  if (density === "compact") {
    return copy.compact[signal] ?? copy.default[signal];
  }

  return copy.default[signal];
}

export const holderActionLabels: Record<AppLocale, Record<HolderAction, string>> = {
  en: { HOLD: "Hold", REVIEW: "Review", REDUCE: "Reduce", SELL: "Sell" },
  bn: { HOLD: "ধরে রাখুন", REVIEW: "পর্যালোচনা করুন", REDUCE: "অবস্থান কমান", SELL: "বিক্রয়" },
};
