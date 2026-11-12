"use client";

import { useAccountMutation } from "@/features/watchlist/hooks/use-account-mutation";
import { assertBackendAuthSession, getBackendAuthSessionVersion, isBackendAuthSessionCurrent } from "@/lib/api/backend-api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/context/auth-context";
import {
  getPortfolioEmailPreference,
  savePortfolioEmailPreference,
  type PortfolioEmailPreferenceDto,
} from "@/lib/api/portfolio-api";
import type { AppLocale } from "@/lib/locale/app-locale";

export function usePortfolioEmailPreference(locale: AppLocale) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const sessionVersion = getBackendAuthSessionVersion();
  const queryKey = ["portfolio", "email-preference", userId] as const;
  const syncedLocaleRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => { assertBackendAuthSession(sessionVersion); return getPortfolioEmailPreference(); },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const mutation = useAccountMutation("email-preference", (payload: PortfolioEmailPreferenceDto) => savePortfolioEmailPreference(payload), {
    onSettled: (_data, _error, _input, account) => queryClient.invalidateQueries({
      queryKey: ["portfolio", "email-preference", account.userId],
      refetchType: isBackendAuthSessionCurrent(account.sessionVersion) ? "active" : "none",
    }),
  });

  useEffect(() => {
    if (!isAuthenticated || !query.isSuccess || !query.data) return;
    const syncKey = `${userId}:${sessionVersion}:${locale}`;
    if (query.data.locale === locale) {
      syncedLocaleRef.current = syncKey;
      return;
    }
    if (syncedLocaleRef.current === syncKey) return;
    syncedLocaleRef.current = syncKey;
    mutation.mutate({ enabled: query.data.enabled, locale });
  }, [isAuthenticated, locale, mutation, query.data, query.isSuccess, sessionVersion, userId]);

  const toggle = useCallback((next: boolean) => {
    mutation.mutate({ enabled: next, locale });
  }, [locale, mutation]);

  return {
    enabled: query.data?.enabled ?? false,
    ready: query.isSuccess || query.isError,
    saving: mutation.isPending,
    toggle,
  };
}
