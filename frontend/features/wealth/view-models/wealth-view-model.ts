import type { WealthInsightCard, WealthToolCalculateResponse } from "@/features/wealth/types/wealth-types";
import {
  formatBangladeshCurrency,
  formatBangladeshCurrencyText,
  formatBangladeshNumber,
} from "@/features/wealth/lib/wealth-formatters";

export function formatWealthCurrency(value: string | number | null | undefined) {
  return formatBangladeshCurrency(value);
}

export function formatWealthNumber(value: string | number | null | undefined) {
  return formatBangladeshNumber(value);
}

export function insightToneClass(severity: WealthInsightCard["severity"]) {
  switch (severity) {
    case "POSITIVE":
      return "wealth-insight-positive";
    case "WARNING":
      return "wealth-insight-warning";
    case "INFO":
      return "wealth-insight-info";
    default:
      return "wealth-insight-neutral";
  }
}

export function buildToolResultViewModel(result: WealthToolCalculateResponse) {
  return {
    headline: formatWealthCurrency(result.headline_value),
    headlineLabel: result.headline_label,
    summary: formatBangladeshCurrencyText(result.summary),
    metrics: result.metrics.map((metric) => ({
      label: metric.label,
      value: formatMetricValue(metric.label, metric.value),
    })),
    timeline: result.timeline.map((point) => ({
      label: point.label,
      value: formatWealthCurrency(point.value),
      realValue: point.real_value != null ? formatWealthCurrency(point.real_value) : null,
    })),
    insights: result.insights,
    nextSteps: result.next_steps,
    disclaimer: result.disclaimer,
  };
}

function formatMetricValue(label: string, value: string | number | null) {
  const normalizedLabel = label.toLowerCase();
  if (value === null || value === "") {
    return "—";
  }
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    return value;
  }
  if (normalizedLabel.includes("income") || normalizedLabel.includes("equivalent") || normalizedLabel.includes("profit")) {
    return formatWealthCurrency(value);
  }
  if (normalizedLabel.includes("rate") || normalizedLabel.includes("progress")) {
    return `${formatWealthNumber(value)}%`;
  }
  if (normalizedLabel.includes("tenure") || normalizedLabel.includes("(months)")) {
    return `${formatWealthNumber(value)} months`;
  }
  if (normalizedLabel.includes("period") && normalizedLabel.includes("year")) {
    return `${formatWealthNumber(value)} years`;
  }
  return formatWealthCurrency(value);
}
