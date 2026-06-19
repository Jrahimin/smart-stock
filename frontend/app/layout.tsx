import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AppProviders } from "@/app/providers";
import { siteConfig } from "@/lib/seo/site-config";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.shortName}`,
  },
  description: siteConfig.defaultDescription,
  icons: {
    icon: [{ url: "/stock-favicon-32.png", sizes: "32x32", type: "image/png" }],
    shortcut: "/stock-favicon-32.png",
    apple: "/stock-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

