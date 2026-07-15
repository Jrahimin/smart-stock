import type { DecisionDisplayAction } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";

type SignalActionLabelCopy = {
  default: Record<DecisionDisplayAction, string>;
  compact: Partial<Record<DecisionDisplayAction, string>>;
};

const signalActionLabels = {
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
      POTENTIAL_BUY: "Potential Buy",
      WAIT: "Wait",
      SELL: "Sell",
      HOLD: "Hold",
    },
    compact: {
      POTENTIAL_BUY: "P. BUY",
    },
  },
} as const satisfies Record<AppLocale, SignalActionLabelCopy>;

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
