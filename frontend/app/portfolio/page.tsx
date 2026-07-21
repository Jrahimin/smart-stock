import type { Metadata } from "next";

import { PortfolioPageShell } from "@/features/portfolio/portfolio-page-shell";

export const metadata: Metadata = {
  title: "My Portfolio — StockWealth BD",
  description: "A private current-position intelligence workspace for your holdings.",
  robots: { index: false, follow: false },
};

export default function PortfolioPage() {
  return <PortfolioPageShell />;
}
