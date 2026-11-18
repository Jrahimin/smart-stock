import type { DecisionDisplayAction, HolderAction } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type SignalActionLabelCopy = {
  default: Record<DecisionDisplayAction | HolderAction, string>;
  compact: Partial<Record<DecisionDisplayAction | HolderAction, string>>;
};

const signalActionLabels: Record<AppLocale, SignalActionLabelCopy> = {
  en: {
    default: {
      POTENTIAL_BUY: "POTENTIAL BUY",
      WAIT: "WAIT",
      SELL: "SELL",
      AVOID: "AVOID",
      HOLD: "HOLD",
      REVIEW: "REVIEW", REDUCE: "REDUCE",
    },
    compact: {
      POTENTIAL_BUY: "P. BUY",
    },
  },
  bn: {
    default: {
      POTENTIAL_BUY: "POTENTIAL BUY",
      WAIT: "WAIT",
      SELL: "SELL",
      AVOID: "AVOID",
      HOLD: "HOLD",
      REVIEW: "REVIEW", REDUCE: "REDUCE",
    },
    compact: {
      POTENTIAL_BUY: "P. BUY",
    },
  },
};

export function getSignalActionLabel(
  signal: DecisionDisplayAction | HolderAction,
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
  bn: { HOLD: "Hold", REVIEW: "Review", REDUCE: "Reduce", SELL: "Sell" },
};
