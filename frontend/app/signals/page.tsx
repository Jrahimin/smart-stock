import type { Metadata } from "next";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { SignalCenterView } from "@/features/signals/signal-center-view";
import { buildSignalsMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildSignalsMetadata();

export default function SignalsPage() {
  return (
    <TerminalAppShell>
      <SignalCenterView />
    </TerminalAppShell>
  );
}
