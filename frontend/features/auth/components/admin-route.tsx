"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/context/auth-context";
import type { UserRole } from "@/features/admin/types/admin-types";

function hasAdminAccess(role: UserRole | undefined) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function AdminRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) {
      return;
    }
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!hasAdminAccess(user?.role)) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, mounted, pathname, router, user?.role]);

  if (!mounted || isLoading || !isAuthenticated || !hasAdminAccess(user?.role)) {
    return (
      <section className="placeholder-panel">
        <p className="eyebrow">Administration</p>
        <h1>Checking admin access</h1>
        <p>Please wait while Smart Stock verifies your permissions.</p>
      </section>
    );
  }

  return <>{children}</>;
}

export function SuperAdminRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) {
      return;
    }
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user?.role !== "SUPER_ADMIN") {
      router.replace("/admin");
    }
  }, [isAuthenticated, isLoading, mounted, pathname, router, user?.role]);

  if (!mounted || isLoading || !isAuthenticated || user?.role !== "SUPER_ADMIN") {
    return (
      <section className="placeholder-panel">
        <p className="eyebrow">Administration</p>
        <h1>Checking super admin access</h1>
        <p>Please wait while Smart Stock verifies your permissions.</p>
      </section>
    );
  }

  return <>{children}</>;
}

export function useIsSuperAdmin() {
  const { user } = useAuth();
  return user?.role === "SUPER_ADMIN";
}
