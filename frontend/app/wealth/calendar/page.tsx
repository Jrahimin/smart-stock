import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MoneyCalendarView } from "@/features/wealth/money-calendar-view";
import {
  buildWealthCalendarBreadcrumbJsonLd,
  buildWealthCalendarMetadata,
} from "@/lib/seo/wealth-page-seo";

export const metadata: Metadata = buildWealthCalendarMetadata();

export default function WealthCalendarPage() {
  return (
    <TerminalAppShell>
      <JsonLdScript data={buildWealthCalendarBreadcrumbJsonLd()} />
      <MoneyCalendarView />
    </TerminalAppShell>
  );
}
