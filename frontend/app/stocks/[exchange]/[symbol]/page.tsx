import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { StockDetailWorkspaceView } from "@/features/stock-workspace/stock-detail-workspace-view";

type StockDetailPageProps = {
  params: Promise<{
    exchange: ExchangeCode;
    symbol: string;
  }>;
};

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { exchange, symbol } = await params;

  return (
    <TerminalAppShell>
      <StockDetailWorkspaceView exchange={exchange} symbol={symbol} />
    </TerminalAppShell>
  );
}
