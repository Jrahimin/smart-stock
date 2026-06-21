"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { MarketCacheSyncCoordinator } from "@/components/market/market-cache-sync-coordinator";
import { AuthProvider } from "@/features/auth/context/auth-context";
import { frontendConfig } from "@/lib/frontend-config";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: frontendConfig.cacheHours * 60 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: frontendConfig.cacheHours * 60 * 60 * 1000,
          },
        },
      }),
  );

  const content = (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <MarketCacheSyncCoordinator />
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );

  if (!frontendConfig.googleClientId) {
    return content;
  }

  return <GoogleOAuthProvider clientId={frontendConfig.googleClientId}>{content}</GoogleOAuthProvider>;
}
