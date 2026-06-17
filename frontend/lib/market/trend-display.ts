import type { TrendDirection } from "@/lib/market/market-intelligence-types";

export type TrendFilterKey = "BULLISH" | "BEARISH" | "SIDEWAYS" | "UNKNOWN";

export function normalizeTrendDirection(value: string | null | undefined): TrendDirection {
  if (value === "UPTREND" || value === "DOWNTREND" || value === "SIDEWAYS" || value === "UNKNOWN") {
    return value;
  }
  return "UNKNOWN";
}

export function formatTrendLabel(trend: TrendDirection): string {
  if (trend === "UPTREND") {
    return "Bullish";
  }
  if (trend === "DOWNTREND") {
    return "Bearish";
  }
  if (trend === "SIDEWAYS") {
    return "Sideways";
  }
  return "Unknown";
}

export function getTrendTone(trend: TrendDirection): "positive" | "negative" | "neutral" {
  if (trend === "UPTREND") {
    return "positive";
  }
  if (trend === "DOWNTREND") {
    return "negative";
  }
  return "neutral";
}

export function getTrendFilterKey(trend: TrendDirection): TrendFilterKey {
  if (trend === "UPTREND") {
    return "BULLISH";
  }
  if (trend === "DOWNTREND") {
    return "BEARISH";
  }
  if (trend === "SIDEWAYS") {
    return "SIDEWAYS";
  }
  return "UNKNOWN";
}

export function formatTrendAriaLabel(trend: TrendDirection): string {
  return formatTrendLabel(trend);
}
