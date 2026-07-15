import type { ScannerCategoryId } from "@/features/scanner/scanner-language";
import type { BackendScannerConditionId, BackendScannerConditionMatchDto } from "@/lib/api/backend-api-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

const CATEGORY_CONDITIONS: Record<ScannerCategoryId, BackendScannerConditionId> = {
  volume_breakouts: "PRICE_VOLUME_BREAKOUT",
  support_rebound: "SUPPORT_REBOUND",
  risk_compression: "LOW_VOLATILITY_COMPRESSION",
  momentum_continuation: "MOMENTUM_CONTINUATION",
  breakdown_risk: "BREAKDOWN",
  oversold_rebound: "SUPPORT_REBOUND",
};

type RankedScannerStock = {
  stock: StockIntelligenceModel;
  match: BackendScannerConditionMatchDto;
};

function compareScannerStocks(left: RankedScannerStock, right: RankedScannerStock): number {
  return (
    left.match.rank - right.match.rank ||
    right.match.rank_score - left.match.rank_score ||
    right.match.capacity_score - left.match.capacity_score ||
    left.stock.stock.symbol.localeCompare(right.stock.stock.symbol) ||
    left.stock.stock.id.localeCompare(right.stock.stock.id)
  );
}

export function buildScannerCategoryItems(
  universe: StockIntelligenceModel[],
  categoryId: ScannerCategoryId,
  limit = 6,
): StockIntelligenceModel[] {
  const conditionId = CATEGORY_CONDITIONS[categoryId];
  return universe
    .flatMap((stock) => {
      const match = stock.scannerConditions?.find(
        (condition) => condition.condition_id === conditionId,
      );
      return match ? [{ stock, match }] : [];
    })
    .sort(compareScannerStocks)
    .slice(0, limit)
    .map(({ stock }) => stock);
}

export function hasScannerCondition(
  stock: StockIntelligenceModel,
  conditionId: BackendScannerConditionId,
): boolean {
  return stock.scannerConditions?.some(
    (condition) => condition.condition_id === conditionId,
  ) ?? false;
}
