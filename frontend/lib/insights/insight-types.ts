export type InsightTone = "positive" | "negative" | "neutral" | "warning" | "info";

export type InsightSource = "DETERMINISTIC" | "HYBRID" | "AI_GENERATED";

export type InsightCategory =
  | "warning"
  | "opportunity"
  | "momentum"
  | "accumulation"
  | "volatility"
  | "valuation"
  | "risk"
  | "quality";

export type InsightBlockModel = {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
  category: InsightCategory;
  source: InsightSource;
  confidenceLabel?: string;
};
