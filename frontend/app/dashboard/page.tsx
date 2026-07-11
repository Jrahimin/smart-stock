import type { Metadata } from "next";

import { DashboardPageShell } from "@/features/market-dashboard/dashboard-page-shell";
import { buildDashboardMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildDashboardMetadata();

export default function DashboardPage() {
  return <DashboardPageShell />;
}
