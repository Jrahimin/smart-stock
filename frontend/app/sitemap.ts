import type { MetadataRoute } from "next";

import type { ActiveStockSymbolDto } from "@/lib/api/stocks-api";
import { fetchServerApiData } from "@/lib/api/server-backend-api";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";
import { siteConfig } from "@/lib/seo/site-config";
import { buildWealthCanonical, listWealthSitemapPaths } from "@/lib/seo/wealth-page-seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteConfig.url}/stocks`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/market-pulse`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
  ];

  const wealthRoutes: MetadataRoute.Sitemap = listWealthSitemapPaths().map((path) => ({
    url: buildWealthCanonical(path),
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/wealth" ? 0.85 : path.startsWith("/wealth/tools") || path.startsWith("/wealth/compare") ? 0.75 : 0.65,
  }));

  const activeSymbols = await fetchServerApiData<ActiveStockSymbolDto[]>("/stocks/active-symbols", 3600);
  if (!activeSymbols?.length) {
    return [...staticRoutes, ...wealthRoutes];
  }

  const stockRoutes: MetadataRoute.Sitemap = activeSymbols.map((entry) => ({
    url: `${siteConfig.url}${buildStockDetailPath(entry.exchange, entry.symbol)}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticRoutes, ...wealthRoutes, ...stockRoutes];
}
