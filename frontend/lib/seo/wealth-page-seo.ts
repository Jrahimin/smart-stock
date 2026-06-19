import type { Metadata } from "next";

import {
  WEALTH_COMPARISON_CARDS,
  WEALTH_TOOL_CONFIG,
} from "@/features/wealth/catalog/wealth-catalog";
import type { WealthComparisonSlug, WealthToolSlug } from "@/features/wealth/types/wealth-types";
import { siteConfig } from "@/lib/seo/site-config";

const WEALTH_TOOL_SEO_TITLES: Partial<Record<WealthToolSlug, string>> = {
  "tax-planner": "Tax Planner Bangladesh",
  fdr: "FDR Calculator Bangladesh",
  dps: "DPS Calculator Bangladesh",
  sanchayapatra: "Sanchayapatra Calculator Bangladesh",
  "compound-growth": "Investment Growth Calculator",
  emi: "Loan EMI Calculator Bangladesh",
  cagr: "CAGR Calculator",
  zakat: "Zakat Calculator",
  retirement: "Retirement Goal Calculator",
  "savings-goal": "Savings Goal Calculator",
};

const WEALTH_COMPARISON_SEO_TITLES: Record<WealthComparisonSlug, string> = {
  "dps-vs-fdr": "DPS vs FDR Comparison",
  "fdr-vs-stocks": "FDR vs Stocks Comparison",
  "save-vs-spend": "Save vs Spend Comparison",
  "loan-prepayment-vs-investing": "Loan Prepayment vs Investing Comparison",
  "inflation-impact": "Inflation Impact Comparison",
};

const WEALTH_HUB_PATH = "/wealth";
const WEALTH_SNAPSHOT_PATH = "/wealth/snapshot";
const WEALTH_CALENDAR_PATH = "/wealth/calendar";

export function buildWealthCanonical(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${normalized}`;
}

export function buildWealthToolPath(toolSlug: WealthToolSlug) {
  return `/wealth/tools/${toolSlug}`;
}

export function buildWealthComparisonPath(comparisonSlug: WealthComparisonSlug) {
  return `/wealth/compare/${comparisonSlug}`;
}

function buildAbsoluteTitle(title: string) {
  return `${title} | ${siteConfig.shortName}`;
}

export function buildWealthPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const absoluteTitle = buildAbsoluteTitle(title);
  const canonical = buildWealthCanonical(path);

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

export function buildWealthHubMetadata(): Metadata {
  return buildWealthPageMetadata({
    title: "Wealth Workspace — Goals, Income & Future Planning",
    description:
      "Explore money decisions before you make them. FDR, DPS, Sanchayapatra, tax planning, comparisons, and personal wealth tools for Bangladesh.",
    path: WEALTH_HUB_PATH,
  });
}

export function buildWealthSnapshotMetadata(): Metadata {
  return buildWealthPageMetadata({
    title: "Money Snapshot — Track Net Worth & Assets",
    description:
      "Build a calm picture of assets, liabilities, and net worth. Start locally or sign in to save your Money Snapshot.",
    path: WEALTH_SNAPSHOT_PATH,
  });
}

export function buildWealthCalendarMetadata(): Metadata {
  return buildWealthPageMetadata({
    title: "Money Calendar — Maturities, Income & Milestones",
    description:
      "See upcoming maturities, periodic income, and personal money milestones on a single timeline.",
    path: WEALTH_CALENDAR_PATH,
  });
}

export function buildWealthToolMetadata(toolSlug: WealthToolSlug): Metadata {
  const config = WEALTH_TOOL_CONFIG[toolSlug];
  const path = buildWealthToolPath(toolSlug);
  const title = WEALTH_TOOL_SEO_TITLES[toolSlug] ?? `${config.title} Calculator`;

  return buildWealthPageMetadata({
    title,
    description: config.prompt,
    path,
  });
}

export function buildWealthComparisonMetadata(comparisonSlug: WealthComparisonSlug): Metadata {
  const card = WEALTH_COMPARISON_CARDS.find((entry) => entry.slug === comparisonSlug);
  const path = buildWealthComparisonPath(comparisonSlug);
  const title = WEALTH_COMPARISON_SEO_TITLES[comparisonSlug] ?? card?.title ?? "Wealth Comparison";

  return buildWealthPageMetadata({
    title,
    description: card?.description ?? "Compare two money paths side by side in Wealth Workspace.",
    path,
  });
}

type BreadcrumbItem = {
  name: string;
  path: string;
};

export function buildWealthBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildWealthCanonical(item.path),
    })),
  };
}

export function buildWealthHubBreadcrumbJsonLd() {
  return buildWealthBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Wealth Workspace", path: WEALTH_HUB_PATH },
  ]);
}

export function buildWealthToolBreadcrumbJsonLd(toolSlug: WealthToolSlug) {
  const config = WEALTH_TOOL_CONFIG[toolSlug];

  return buildWealthBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Wealth Workspace", path: WEALTH_HUB_PATH },
    { name: config.title, path: buildWealthToolPath(toolSlug) },
  ]);
}

export function buildWealthComparisonBreadcrumbJsonLd(comparisonSlug: WealthComparisonSlug) {
  const card = WEALTH_COMPARISON_CARDS.find((entry) => entry.slug === comparisonSlug);

  return buildWealthBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Wealth Workspace", path: WEALTH_HUB_PATH },
    {
      name: card?.title ?? "Comparison",
      path: buildWealthComparisonPath(comparisonSlug),
    },
  ]);
}

export function buildWealthSnapshotBreadcrumbJsonLd() {
  return buildWealthBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Wealth Workspace", path: WEALTH_HUB_PATH },
    { name: "Money Snapshot", path: WEALTH_SNAPSHOT_PATH },
  ]);
}

export function buildWealthCalendarBreadcrumbJsonLd() {
  return buildWealthBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Wealth Workspace", path: WEALTH_HUB_PATH },
    { name: "Money Calendar", path: WEALTH_CALENDAR_PATH },
  ]);
}

export function listWealthSitemapPaths() {
  const toolPaths = (Object.keys(WEALTH_TOOL_CONFIG) as WealthToolSlug[]).map(buildWealthToolPath);
  const comparisonPaths = WEALTH_COMPARISON_CARDS.map((card) => buildWealthComparisonPath(card.slug));

  return [WEALTH_HUB_PATH, WEALTH_SNAPSHOT_PATH, WEALTH_CALENDAR_PATH, ...toolPaths, ...comparisonPaths];
}
