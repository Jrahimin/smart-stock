import type { DecisionDisplayAction } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { getSignalActionLabel } from "@/lib/market/signal-action-labels";

type SignalBadgeProps = {
  signal: DecisionDisplayAction | null;
  density?: "default" | "compact";
  locale?: AppLocale;
};

export function SignalBadge({ signal, density = "default", locale = DEFAULT_LOCALE }: SignalBadgeProps) {
  if (!signal) return <span className="signal-badge signal-badge-unavailable">{locale === "bn" ? "অনুপলব্ধ" : "Unavailable"}</span>;
  const label = getSignalActionLabel(signal, locale, density);
  const fullLabel = getSignalActionLabel(signal, locale, "default");
  return <span aria-label={fullLabel} className={`signal-badge signal-badge-${signal.toLowerCase()}${density === "compact" ? " signal-badge-compact" : ""}`} title={density === "compact" ? fullLabel : undefined}>
    <i aria-hidden="true" />{label}
  </span>;
}
