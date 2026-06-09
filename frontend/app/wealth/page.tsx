import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WealthWorkspaceView } from "@/features/wealth/wealth-workspace-view";

export default function WealthPage() {
  return (
    <TerminalAppShell>
      <WealthWorkspaceView />
    </TerminalAppShell>
  );
}
