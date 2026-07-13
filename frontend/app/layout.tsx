import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import "@/app/globals.css";
import { AppGoogleAnalytics } from "@/components/analytics/google-analytics";
import { AppProviders } from "@/app/providers";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";
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

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
      <AppGoogleAnalytics />
    </html>
  );
}

