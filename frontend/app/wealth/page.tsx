import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { WealthWorkspaceView } from "@/features/wealth/wealth-workspace-view";
import { buildWealthHubBreadcrumbJsonLd, buildWealthHubMetadata } from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthHubMetadata();

export default function WealthPage() {
  return (
    <TerminalAppShell>
      <JsonLdScript data={buildWealthHubBreadcrumbJsonLd()} />
      <WealthWorkspaceView />
    </TerminalAppShell>
  );
}
