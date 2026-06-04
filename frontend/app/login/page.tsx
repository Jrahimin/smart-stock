import { Suspense } from "react";

import { LoginPageClient } from "@/features/auth/components/login-page-client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageClient />
    </Suspense>
  );
}
