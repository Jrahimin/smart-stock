import { Suspense } from "react";

import { VerifyEmailPageClient } from "@/features/auth/components/verify-email-page-client";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageClient />
    </Suspense>
  );
}
