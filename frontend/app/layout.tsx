import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AppProviders } from "@/app/providers";

export const metadata: Metadata = {
  title: "Smart Stock Intelligence",
  description: "Institutional stock intelligence workspace for the Bangladesh market",
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

