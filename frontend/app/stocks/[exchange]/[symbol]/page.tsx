import type { Metadata } from "next";

import { JsonLdScript } from "@/components/seo/json-ld-script";
import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import type { BackendStockDto, ExchangeCode } from "@/lib/api/backend-api-types";
import type { StockWorkspaceDto } from "@/lib/api/stock-decision-support-types";
import { fetchServerApiData } from "@/lib/api/server-backend-api";
import { StockDetailWorkspaceView } from "@/features/stock-workspace/stock-detail-workspace-view";
import { buildStockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { buildStockSemanticSummary } from "@/features/stock-workspace/view-models/stock-semantic-summary-view-model";
import { buildStockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import {
  buildStockBreadcrumbJsonLd,
  buildStockDetailCanonical,
  buildStockDetailTitle,
  buildStockOrganizationJsonLd,
} from "@/lib/seo/stock-page-seo";
import { siteConfig } from "@/lib/seo/site-config";

type StockDetailPageProps = {
  params: Promise<{
    exchange: ExchangeCode;
    symbol: string;
  }>;
};

async function loadStockMetadata(exchange: ExchangeCode, symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const [stock, workspace] = await Promise.all([
    fetchServerApiData<BackendStockDto>(`/stocks/lookup/${exchange}/${normalizedSymbol}`),
    fetchServerApiData<StockWorkspaceDto>(`/stock-details/${exchange}/${normalizedSymbol}/workspace`),
  ]);

  return { stock, workspace };
}

export async function generateMetadata({ params }: StockDetailPageProps): Promise<Metadata> {
  const { exchange, symbol } = await params;
  const normalizedSymbol = symbol.toUpperCase();
  const { stock, workspace } = await loadStockMetadata(exchange, normalizedSymbol);

  if (!stock) {
    return {
      title: `${normalizedSymbol} Share Price & Analysis | ${siteConfig.shortName}`,
      description: "Stock research workspace for the Bangladesh market.",
      alternates: {
        canonical: buildStockDetailCanonical(exchange, normalizedSymbol),
      },
    };
  }

  const model = buildStockWorkspaceModel(stock, workspace?.prices ?? []);
  const decisionModel = buildStockDecisionViewModel(workspace?.decision_support);
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
  const { stock } = await loadStockMetadata(exchange, normalizedSymbol);

  const structuredData = stock
    ? [buildStockBreadcrumbJsonLd(exchange, stock.symbol, stock.name), buildStockOrganizationJsonLd(stock)]
    : [];

  return (
    <TerminalAppShell>
      {structuredData.length ? <JsonLdScript data={structuredData} /> : null}
      <StockDetailWorkspaceView exchange={exchange} symbol={normalizedSymbol} />
    </TerminalAppShell>
  );
}
