import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type { BackendStockTraderDecisionDto, BackendTradingSignalDto } from "@/lib/api/backend-api-types";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

const DASHBOARD_SIGNAL_UNIVERSE_LIMIT = 500;
const DASHBOARD_SIGNAL_FEED_LIMIT = 8;

export function listLatestSignals(limit = 500, offset = 0) {
  return backendApiGetMarket<BackendTradingSignalDto[]>("/signals/latest", {
    limit,
    offset,
  });
}

export function listLatestTraderDecisions(exchange: ExchangeCode = "DSE", limit = DASHBOARD_SIGNAL_UNIVERSE_LIMIT) {
  return backendApiGetMarket<BackendStockTraderDecisionDto[]>("/signals/decisions/latest", {
    exchange,
    limit,
    offset: 0,
  });
}

export type DashboardTraderSignalsResult = {
  signals: BackendStockTraderDecisionDto[];
  evaluatedCount: number;
};

export async function fetchDashboardTraderSignals(exchange: ExchangeCode = "DSE"): Promise<DashboardTraderSignalsResult> {
  const decisions = await listLatestTraderDecisions(exchange, DASHBOARD_SIGNAL_UNIVERSE_LIMIT);
  return {
    signals: decisions,
    evaluatedCount: decisions.length,
  };
}

export function listStockSignals(stockId: string, limit = 100, offset = 0) {
  return backendApiGetMarket<BackendTradingSignalDto[]>(`/stocks/${stockId}/signals`, {
    limit,
    offset,
  });
}
