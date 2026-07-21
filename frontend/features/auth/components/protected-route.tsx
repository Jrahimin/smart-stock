"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/context/auth-context";
import { getStoredRefreshToken } from "@/lib/api/backend-api-client";

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [hasSessionHint, setHasSessionHint] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    setHasSessionHint(Boolean(getStoredRefreshToken()));
  }, []);

  useEffect(() => {
    if (!hasMounted || isLoading || isAuthenticated) return;
    router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [hasMounted, isAuthenticated, isLoading, pathname, router]);

  if (!hasMounted) {
    return null;
  }

  if (isLoading && hasSessionHint) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return hasSessionHint ? null : null;
  }

  return <>{children}</>;
}
