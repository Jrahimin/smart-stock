import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AppProviders } from "@/app/providers";

export const metadata: Metadata = {
  title: "Smart Stock Intelligence",
  description: "Institutional stock intelligence workspace for the Bangladesh market",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

