"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/context/auth-context";

function AuthCheckingPlaceholder() {
  return (
    <section className="placeholder-panel">
      <p className="eyebrow">Authentication</p>
      <h1>Checking your session</h1>
      <p>Please wait while Smart Stock verifies your account.</p>
    </section>
  );
}

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted || isLoading || isAuthenticated) return;
    router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [hasMounted, isAuthenticated, isLoading, pathname, router]);

  if (!hasMounted || isLoading || !isAuthenticated) {
    return <AuthCheckingPlaceholder />;
  }

  return <>{children}</>;
}
