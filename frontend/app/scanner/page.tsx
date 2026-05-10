import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";

export default function ScannerPage() {
  return (
    <TerminalAppShell>
      <ScannerWorkspaceView />
    </TerminalAppShell>
  );
}
