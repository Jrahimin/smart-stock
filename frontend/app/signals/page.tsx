import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { SignalCenterView } from "@/features/signals/signal-center-view";

export default function SignalsPage() {
  return (
    <TerminalAppShell>
      <SignalCenterView />
    </TerminalAppShell>
  );
}
