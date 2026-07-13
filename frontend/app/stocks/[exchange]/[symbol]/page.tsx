import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { loadStockWorkspace } from "@/lib/api/stock-detail-server";
import { StockDurableSummary } from "@/features/stock-workspace/components/stock-durable-summary";
import { StockDetailWorkspaceView } from "@/features/stock-workspace/stock-detail-workspace-view";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
import {
  buildStockBreadcrumbJsonLd,
  buildStockDetailCanonical,
  buildStockDetailTitle,
  buildStockOrganizationJsonLd,
} from "@/lib/seo/stock-page-seo";
import { siteConfig } from "@/lib/seo/site-config";

// Must be a literal — Next.js cannot statically analyze imported segment config.
// Keep in sync with STOCK_DETAIL_REVALIDATE_SECONDS in lib/seo/stock-detail-cache.ts
// (aligned to market dashboard cache TTL default of 600s; same-day freshness uses Redis TTL).
export const revalidate = 600;

type StockDetailPageProps = {
  params: Promise<{
    exchange: ExchangeCode;
    symbol: string;
  }>;
};

function fallbackMetadata(exchange: ExchangeCode, symbol: string): Metadata {
  return {
    title: `${symbol} Share Price & Analysis | ${siteConfig.shortName}`,
    description: "Stock research workspace for the Bangladesh market.",
    alternates: {
      canonical: buildStockDetailCanonical(exchange, symbol),
    },
  };
}

export async function generateMetadata({ params }: StockDetailPageProps): Promise<Metadata> {
  const { exchange, symbol } = await params;
  const normalizedSymbol = symbol.toUpperCase();
  const result = await loadStockWorkspace(exchange, normalizedSymbol);

  if (result.status !== "ok") {
    return fallbackMetadata(exchange, normalizedSymbol);
  }

  const stock = result.data.stock;
  const model = buildStockWorkspaceModel(stock, result.data.prices ?? [], {
    decisionSupport: result.data.decision_support,
    displayMetrics: result.data.display_metrics,
  });
  const decisionModel = buildStockDecisionViewModel(result.data.decision_support);
  const description = buildStockSemanticSummary(model, decisionModel);
  const title = buildStockDetailTitle(stock.symbol, stock.name);
  const canonical = buildStockDetailCanonical(exchange, stock.symbol);

  return {
    title: {
      absolute: title,
    },
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { exchange, symbol } = await params;
  const normalizedSymbol = symbol.toUpperCase();
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const result = await loadStockWorkspace(exchange, normalizedSymbol);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    // Do not call notFound() — that would cache a false 404 for transient API failures.
    throw new Error(result.message);
  }

  const workspace = result.data;
  const stock = workspace.stock;
  const structuredData = [
    buildStockBreadcrumbJsonLd(exchange, stock.symbol, stock.name),
    buildStockOrganizationJsonLd(stock),
  ];

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <JsonLdScript data={structuredData} />
      <StockDurableSummary locale={locale} workspace={workspace} />
      <StockDetailWorkspaceView
        exchange={exchange}
        initialWorkspace={workspace}
        locale={locale}
        symbol={normalizedSymbol}
      />
    </TerminalAppShell>
  );
}
