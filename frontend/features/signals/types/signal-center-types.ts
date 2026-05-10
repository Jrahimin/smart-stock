import type { SignalType } from "@/lib/api/backend-api-types";

export type SignalCenterItemModel = {
  symbol: string;
  signal: SignalType;
  confidence: string;
  reason: string;
  generatedAt: string;
};
