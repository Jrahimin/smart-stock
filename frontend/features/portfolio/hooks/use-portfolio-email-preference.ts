"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryKey = ["portfolio", "email-preference", user?.id ?? "anonymous"] as const;
  const syncedLocaleRef = useRef<AppLocale | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: getPortfolioEmailPreference,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: savePortfolioEmailPreference,
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PortfolioEmailPreferenceDto>(queryKey);
      queryClient.setQueryData<PortfolioEmailPreferenceDto>(queryKey, payload);
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: "inactive" });
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !query.isSuccess || !query.data) return;
    if (query.data.locale === locale) {
      syncedLocaleRef.current = locale;
      return;
    }
    if (syncedLocaleRef.current === locale) return;
    syncedLocaleRef.current = locale;
    mutation.mutate({ enabled: query.data.enabled, locale });
  }, [isAuthenticated, locale, mutation, query.data, query.isSuccess]);

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
