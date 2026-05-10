export type InsightTone = "positive" | "negative" | "neutral" | "warning" | "info";

export type InsightSource = "DETERMINISTIC" | "HYBRID" | "AI_GENERATED";

export type InsightBlockModel = {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
  source: InsightSource;
  confidenceLabel?: string;
};
