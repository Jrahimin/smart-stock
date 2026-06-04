"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/context/auth-context";

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <section className="placeholder-panel">
        <p className="eyebrow">Authentication</p>
        <h1>Checking your session</h1>
        <p>Please wait while Smart Stock verifies your account.</p>
      </section>
    );
  }

  return <>{children}</>;
}
