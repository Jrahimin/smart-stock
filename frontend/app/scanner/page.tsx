import type { Metadata } from "next";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ScannerWorkspaceView } from "@/features/scanner/scanner-workspace-view";
import { buildScannerMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildScannerMetadata();

export default function ScannerPage() {
  return (
    <TerminalAppShell>
      <ScannerWorkspaceView />
    </TerminalAppShell>
  );
}
