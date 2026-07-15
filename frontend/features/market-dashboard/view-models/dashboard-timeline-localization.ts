import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getSignalActionLabel } from "@/lib/market/signal-action-labels";
import {
  resolveDecisionReasonSummary,
  resolveTraderDecisionReason,
} from "@/lib/market/trader-decision-reason";

function localizeTimelineTime(time: string, templates: DashboardLanguage["timeline"]["templates"]): string {
  if (time === "Data quality") {
    return templates.dataQualityTime;
  }

  if (time === "Latest") {
    return templates.latestTime;
  }

  return time;
}

function localizeTimelineTitle(
  title: string,
  locale: AppLocale,
  templates: DashboardLanguage["timeline"]["templates"],
): string {
  if (title === "Market snapshot ready") {
    return templates.snapshotReadyTitle;
  }

  if (title === "Market scan complete") {
    return templates.scanCompleteTitle;
  }

  if (title === "Suspicious activity flagged") {
    return templates.suspiciousTitle;
  }

  const actionMatch = title.match(/^(.+) (Potential Buy|Wait|Sell|Hold)$/i);
  if (actionMatch) {
    const symbol = actionMatch[1] ?? "";
    const actionPhrase = (actionMatch[2] ?? "").toLowerCase();
    const action =
      actionPhrase === "potential buy"
        ? "POTENTIAL_BUY"
        : actionPhrase === "sell"
          ? "SELL"
          : actionPhrase === "hold"
            ? "HOLD"
            : "WAIT";
    return templates.decisionTitle(symbol, getSignalActionLabel(action, locale));
  }

  return title;
}

function localizeTimelineDescription(
  description: string,
  locale: AppLocale,
  templates: DashboardLanguage["timeline"]["templates"],
  decisionReasons: DashboardLanguage["signals"]["decisionReasons"],
): string {
  const topMoverMatch = description.match(
    /^Top session mover in the latest snapshot \((.+)\)\.?$/i,
  );
  if (topMoverMatch) {
    return templates.topMoverDescription(topMoverMatch[1] ?? "");
  }

  const snapshotMatch = description.match(
    /^(\d+) active instruments in the latest price snapshot\.?$/i,
  );
  if (snapshotMatch) {
    return templates.snapshotReadyDescription(Number.parseInt(snapshotMatch[1] ?? "0", 10));
  }

  const scanMatch = description.match(
    /^(\d+) active instruments were evaluated with the shared trader decision engine\.?$/i,
  );
  if (scanMatch) {
    return templates.scanCompleteDescription(Number.parseInt(scanMatch[1] ?? "0", 10));
  }

  const suspiciousMatch = description.match(
    /^(\d+|Some) instruments need source validation before acting on signals\.?$/i,
  );
  if (suspiciousMatch) {
    return templates.suspiciousDescription(suspiciousMatch[1] ?? "Some");
  }

  const resolvedReason = resolveTraderDecisionReason(description);
  if (resolvedReason.key !== "unknown") {
    return resolveDecisionReasonSummary(resolvedReason, decisionReasons);
  }

  return description;
}

export function localizeTimelineItem(
  item: MarketTimelineItemModel,
  locale: AppLocale,
  language: DashboardLanguage,
): MarketTimelineItemModel {
  if (locale === "en") {
    return item;
  }

  const { templates } = language.timeline;

  return {
    time: localizeTimelineTime(item.time, templates),
    title: localizeTimelineTitle(item.title, locale, templates),
    description: localizeTimelineDescription(
      item.description,
      locale,
      templates,
      language.signals.decisionReasons,
    ),
  };
}

export function localizeTimelineItems(
  items: MarketTimelineItemModel[],
  locale: AppLocale,
  language: DashboardLanguage,
): MarketTimelineItemModel[] {
  if (locale === "en") {
    return items;
  }

  return items.map((item) => localizeTimelineItem(item, locale, language));
}
