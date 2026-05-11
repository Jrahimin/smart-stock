"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
