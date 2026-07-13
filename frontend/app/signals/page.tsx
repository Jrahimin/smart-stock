import type { Metadata } from "next";

import { SignalsPageShell } from "@/features/signals/signals-page-shell";
import { buildSignalsMetadata } from "@/lib/seo/site-page-seo";

export const metadata: Metadata = buildSignalsMetadata();

export default function SignalsPage() {
  return <SignalsPageShell />;
}
