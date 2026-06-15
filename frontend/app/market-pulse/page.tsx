import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MarketPulseView } from "@/features/market-pulse/market-pulse-view";

export default function MarketPulsePage() {
  return (
    <TerminalAppShell>
      <MarketPulseView />
    </TerminalAppShell>
  );
}
