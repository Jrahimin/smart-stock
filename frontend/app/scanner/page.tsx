import type { Metadata } from "next";

import { ScannerPageShell } from "@/features/scanner/scanner-page-shell";
import { buildScannerMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildScannerMetadata();

export default function ScannerPage() {
  return <ScannerPageShell />;
}
