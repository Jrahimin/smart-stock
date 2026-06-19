function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

export const siteConfig = {
  name: "StockWealth BD",
  shortName: "StockWealth BD",
  tagline: "Stock intelligence and wealth planning for Bangladesh",
  defaultDescription:
    "Bangladesh stock intelligence and personal wealth planning — market dashboard, stock research, FDR, DPS, Sanchayapatra, tax tools, and comparisons.",
  url: resolveSiteUrl(),
};
