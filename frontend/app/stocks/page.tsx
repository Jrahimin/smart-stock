import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";

export default function StocksPage() {
  return (
    <TerminalAppShell>
      <StockExplorerView />
    </TerminalAppShell>
  );
}
