import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/seo/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/register", "/verify-email", "/profile", "/admin", "/watchlist", "/portfolio"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
