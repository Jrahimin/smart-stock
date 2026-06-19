import type { Metadata } from "next";

import DashboardPage from "@/app/dashboard/page";
import { buildHomeMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildHomeMetadata();

export default function HomePage() {
  return <DashboardPage />;
}
