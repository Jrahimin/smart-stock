import type { Metadata } from "next";

import { DashboardPageShell } from "@/features/market-dashboard/dashboard-page-shell";
import { buildHomeMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildHomeMetadata();

export default function HomePage() {
  return <DashboardPageShell />;
}
