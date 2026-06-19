import type { Metadata } from "next";

import { siteConfig } from "@/lib/seo/site-config";

export function buildSiteCanonical(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${normalized}`;
}

function buildAbsoluteTitle(title: string) {
  return `${title} | ${siteConfig.shortName}`;
}

export function buildSitePageMetadata({
  title,
  description = siteConfig.defaultDescription,
  path,
}: {
  title: string;
  description?: string;
  path: string;
}): Metadata {
  const absoluteTitle = buildAbsoluteTitle(title);
  const canonical = buildSiteCanonical(path);

  return {
    title: {
      absolute: absoluteTitle,
    },
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: absoluteTitle,
      description,
      type: "website",
      url: canonical,
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title: absoluteTitle,
      description,
    },
  };
}

export function buildHomeMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Stock & Wealth Intelligence Dashboard",
    description: siteConfig.defaultDescription,
    path: "/",
  });
}

export function buildDashboardMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Market Dashboard",
    description:
      "Bangladesh market dashboard with breadth, heatmap, movers, signals, and institutional-style stock intelligence.",
    path: "/dashboard",
  });
}

export function buildMarketPulseMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Market Pulse — Daily Bangladesh Stock Briefing",
    description:
      "Daily market pulse for the DSE with focus stocks, insight, changes, and alerts in one editorial briefing.",
    path: "/market-pulse",
  });
}

export function buildStocksMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Stocks — Explore DSE Companies",
    description:
      "Explore DSE stocks with price context, trends, signals, and links to detailed share analysis.",
    path: "/stocks",
  });
}

export function buildScannerMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Stock Scanner",
    description:
      "Scan the Bangladesh stock universe with trader-focused filters, signals, and deterministic intelligence.",
    path: "/scanner",
  });
}

export function buildSignalsMetadata(): Metadata {
  return buildSitePageMetadata({
    title: "Smart Signals",
    description:
      "Explanation-first buy, sell, and hold signals with confidence and risk context for Bangladesh stocks.",
    path: "/signals",
  });
}
