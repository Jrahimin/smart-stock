import type { Metadata } from "next";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import type { BackendStockDto, ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { fetchServerApiData } from "@/lib/api/server-backend-api";
import { StockDetailWorkspaceView } from "@/features/stock-workspace/stock-detail-workspace-view";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type StockDetailPageProps = {
  params: Promise<{
    exchange: ExchangeCode;
    symbol: string;
  }>;
};

async function loadStockMetadata(exchange: ExchangeCode, symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const [stock, workspace] = await Promise.all([
    fetchServerApiData<BackendStockDto>(`/stocks/lookup/${exchange}/${normalizedSymbol}`),
    fetchServerApiData<StockWorkspaceDto>(`/stock-details/${exchange}/${normalizedSymbol}/workspace`),
  ]);

  return { stock, workspace };
}

export async function generateMetadata({ params }: StockDetailPageProps): Promise<Metadata> {
  const { exchange, symbol } = await params;
  const { stock, workspace } = await loadStockMetadata(exchange, symbol);

  if (!stock) {
    return {
      title: `${symbol.toUpperCase()} | Stock Intelligence`,
      description: "Stock research workspace for the Bangladesh market.",
    };
  }

  const model = buildStockWorkspaceModel(stock, workspace?.prices ?? []);
  const decisionModel = buildStockDecisionViewModel(workspace?.decision_support);
  const description = buildStockSemanticSummary(model, decisionModel);
  const title = `${stock.symbol} — ${stock.name} | Stock Intelligence`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { exchange, symbol } = await params;

  return (
    <TerminalAppShell>
      <StockDetailWorkspaceView exchange={exchange} symbol={symbol} />
    </TerminalAppShell>
  );
}
