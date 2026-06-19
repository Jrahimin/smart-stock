import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MoneySnapshotDashboardView } from "@/features/wealth/money-snapshot-dashboard-view";
import {
  buildWealthSnapshotBreadcrumbJsonLd,
  buildWealthSnapshotMetadata,
} from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthSnapshotMetadata();

export default function WealthSnapshotPage() {
  return (
    <TerminalAppShell>
      <JsonLdScript data={buildWealthSnapshotBreadcrumbJsonLd()} />
      <MoneySnapshotDashboardView />
    </TerminalAppShell>
  );
}
