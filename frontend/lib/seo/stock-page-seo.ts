import type { BackendStockDto, ExchangeCode } from "@/lib/api/backend-api-types";
import { siteConfig } from "@/lib/seo/site-config";

export function encodeStockSymbolSegment(symbol: string) {
  return encodeURIComponent(symbol.toUpperCase());
}

export function buildStockDetailPath(exchange: ExchangeCode, symbol: string) {
  return `/stocks/${exchange}/${encodeStockSymbolSegment(symbol)}`;
}

export function buildStockDetailCanonical(exchange: ExchangeCode, symbol: string) {
  return `${siteConfig.url}${buildStockDetailPath(exchange, symbol)}`;
}

export function buildStockDetailTitle(symbol: string, name: string) {
  return `${symbol.toUpperCase()} Share Price, Dividend, PE Ratio & Analysis — ${name}`;
}

export function buildStockBreadcrumbJsonLd(exchange: ExchangeCode, symbol: string, stockName: string) {
  const canonical = buildStockDetailCanonical(exchange, symbol);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteConfig.url,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Stocks",
        item: `${siteConfig.url}/stocks`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: exchange,
        item: `${siteConfig.url}/stocks`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: symbol.toUpperCase(),
        item: canonical,
      },
    ],
  };
}

export function buildStockOrganizationJsonLd(stock: BackendStockDto) {
  const canonical = buildStockDetailCanonical(stock.exchange, stock.symbol);

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: stock.name,
    tickerSymbol: stock.symbol,
    url: canonical,
    ...(stock.sector ? { industry: stock.sector } : {}),
    additionalProperty: {
      "@type": "PropertyValue",
      name: "exchange",
      value: stock.exchange,
    },
  };
}
