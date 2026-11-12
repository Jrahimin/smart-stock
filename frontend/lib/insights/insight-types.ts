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
  interpretation?: import("@/lib/api/backend-api-types").BackendMarketInterpretationDto | null;
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
  category: InsightCategory;
  categoryLabel?: string;
  source: InsightSource;
  confidenceLabel?: string;
};
