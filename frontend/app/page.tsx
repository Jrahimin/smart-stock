import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { DashboardPageShell } from "@/features/market-dashboard/dashboard-page-shell";
import { buildHomeJsonLd, buildHomeMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildHomeMetadata();

export default function HomePage() {
  return (
    <>
      <JsonLdScript data={buildHomeJsonLd()} />
      <DashboardPageShell />
    </>
  );
}
