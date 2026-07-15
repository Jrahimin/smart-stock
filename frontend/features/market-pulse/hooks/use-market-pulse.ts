"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { readMarketPulseSnapshot, writeMarketPulseSnapshot } from "@/features/market-pulse/lib/market-pulse-storage";
import {
  buildMarketPulseSnapshotFromDto,
  buildMarketPulseViewModel,
} from "@/features/market-pulse/view-models/market-pulse-view-model";
import {
  getMarketPulseBriefing,
  getMarketPulseSummary,
  type BackendMarketPulseSummaryDto,
} from "@/lib/api/market-pulse-api";
import type { BackendMarketPulseDto, BackendMarketPulsePreviousSnapshotDto } from "@/lib/api/backend-api-types";
import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketRefetchIntervalMs, getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";
import {
  buildPulseBriefingQueryKey,
  buildPulseSummaryQueryKey,
  normalizeDisplayName,
  PULSE_ANONYMOUS_BRIEFING_QUERY_KEY,
  PULSE_ANONYMOUS_SUMMARY_QUERY_KEY,
} from "@/lib/market/pulse-query-keys";
import {
  resolveMarketPulseBriefing,
  resolveMarketPulseBriefingFlags,
  resolveMarketPulsePresentationFlags,
  resolveMarketPulseSummary,
  shouldWriteMarketPulseSnapshot,
} from "@/features/market-pulse/lib/market-pulse-query-state";

function toApiPreviousSnapshot(stored: ReturnType<typeof readMarketPulseSnapshot>): BackendMarketPulsePreviousSnapshotDto | null {
  if (!stored.lastSyncedAt) {
    return null;
  }

  return {
    last_synced_at: stored.lastSyncedAt,
    score_version: stored.scoreVersion,
    focus_stock_ids: stored.focusStockIds,
    scores: stored.scores,
    recommendations: stored.recommendations,
    alert_ids: stored.alertIds,
  };
}

function buildPulseDtoFromSummary(
  summary: BackendMarketPulseSummaryDto,
  briefing: BackendMarketPulseDto["briefing"] | null | undefined,
): BackendMarketPulseDto {
  return {
    ...summary,
    briefing: briefing ?? null,
    today_insight: null,
    changes: [],
    market_movers: { gainers: [], losers: [] },
  };
}

export type MarketPulseHookResult = {
  model: ReturnType<typeof buildMarketPulseViewModel> | null;
  showFullPageLoader: boolean;
  showUnavailable: boolean;
  showPersonalizationWarning: boolean;
  showBriefingPersonalizationWarning: boolean;
  isBriefingLoading: boolean;
  sectionLoading: { focus: boolean };
  isError: boolean;
  refetch: () => void;
};

export function useMarketPulse(options?: {
  initialCore?: MarketPulseCorePayload | null;
  locale?: AppLocale;
}): MarketPulseHookResult {
  const initialCore = options?.initialCore ?? null;
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const { user } = useAuth();
  const refreshMarketCaches = useMarketCacheRefresh();
  const freshnessQuery = useMarketDataFreshness("DSE", {
    refetchInterval: false,
    initialData: initialCore?.freshness ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });
  const staleTime = getMarketStaleTimeMs(freshnessQuery.data);
  const refetchInterval = getMarketRefetchIntervalMs(freshnessQuery.data);
  const freshnessLastSyncedAt = freshnessQuery.data?.last_synced_at ?? null;

  const [storedSnapshot] = useState(readMarketPulseSnapshot);
  const previousSnapshot = useMemo(() => toApiPreviousSnapshot(storedSnapshot), [storedSnapshot]);
  const displayName = normalizeDisplayName(user?.display_name);
  const hasPersonalizationInputs = Boolean(displayName) || Boolean(previousSnapshot?.last_synced_at);
  const hasBriefingPersonalization = Boolean(displayName);

  const anonymousSummaryQuery = useQuery({
    queryKey: PULSE_ANONYMOUS_SUMMARY_QUERY_KEY,
    queryFn: () =>
      getMarketPulseSummary({
        exchange: "DSE",
        previousSnapshot: null,
        displayName: null,
      }),
    staleTime,
    refetchInterval,
    initialData: initialCore?.summary ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });

  const personalizedSummaryQuery = useQuery({
    queryKey: buildPulseSummaryQueryKey({
      exchange: "DSE",
      displayName,
      previousSnapshot,
    }),
    queryFn: () =>
      getMarketPulseSummary({
        exchange: "DSE",
        previousSnapshot,
        displayName,
      }),
    staleTime,
    refetchInterval,
    enabled: hasPersonalizationInputs,
  });

  const { anonymousSummary, personalizedSummary, resolvedSummary } = resolveMarketPulseSummary(
    initialCore,
    anonymousSummaryQuery,
    personalizedSummaryQuery,
    freshnessLastSyncedAt,
  );

  const anonymousBriefingQuery = useQuery({
    queryKey: PULSE_ANONYMOUS_BRIEFING_QUERY_KEY,
    queryFn: () =>
      getMarketPulseBriefing({
        exchange: "DSE",
        displayName: null,
      }),
    staleTime,
    refetchInterval,
    enabled: Boolean(resolvedSummary),
    initialData: initialCore?.briefing ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });

  const personalizedBriefingQuery = useQuery({
    queryKey: buildPulseBriefingQueryKey({ exchange: "DSE", displayName }),
    queryFn: () =>
      getMarketPulseBriefing({
        exchange: "DSE",
        displayName,
      }),
    staleTime,
    refetchInterval,
    enabled: hasBriefingPersonalization && Boolean(resolvedSummary),
  });

  const { anonymousBriefing, resolvedBriefing } = resolveMarketPulseBriefing(
    initialCore,
    anonymousBriefingQuery,
    personalizedBriefingQuery,
  );

  const { isBriefingLoading, isBriefingError, showBriefingPersonalizationWarning } =
    resolveMarketPulseBriefingFlags(
      resolvedBriefing,
      anonymousBriefingQuery,
      personalizedBriefingQuery,
      anonymousBriefing,
    );

  const pulseDto = useMemo<BackendMarketPulseDto | null>(() => {
    if (!resolvedSummary) {
      return null;
    }

    return buildPulseDtoFromSummary(resolvedSummary, resolvedBriefing);
  }, [resolvedBriefing, resolvedSummary]);

  const model = useMemo(
    () => (pulseDto ? buildMarketPulseViewModel(pulseDto, locale) : null),
    [locale, pulseDto],
  );

  const {
    anonymousSettled,
    showFullPageLoader,
    showUnavailable,
    showPersonalizationWarning,
    sectionLoading,
  } = resolveMarketPulsePresentationFlags(
    anonymousSummary,
    resolvedSummary,
    anonymousSummaryQuery,
    personalizedSummaryQuery,
    freshnessLastSyncedAt,
  );

  useEffect(() => {
    const lastSyncedAt = freshnessQuery.data?.last_synced_at;
    if (
      !shouldWriteMarketPulseSnapshot({
        hasPersonalizationInputs,
        anonymousSettled,
        anonymousSummary,
        personalizedSummaryQuerySuccess: personalizedSummaryQuery.isSuccess,
        personalizedSummary,
        lastSyncedAt,
        resolvedSummary,
      })
    ) {
      return;
    }

    const summaryForSnapshot = hasPersonalizationInputs ? personalizedSummary : anonymousSummary;
    if (!summaryForSnapshot) {
      return;
    }

    writeMarketPulseSnapshot({
      ...buildMarketPulseSnapshotFromDto(buildPulseDtoFromSummary(summaryForSnapshot, resolvedBriefing)),
      lastSyncedAt: lastSyncedAt!,
    });
  }, [
    anonymousSettled,
    anonymousSummary,
    resolvedBriefing,
    freshnessQuery.data?.last_synced_at,
    hasPersonalizationInputs,
    personalizedSummary,
    personalizedSummaryQuery.isSuccess,
    resolvedSummary,
  ]);

  return {
    model,
    showFullPageLoader,
    showUnavailable,
    showPersonalizationWarning,
    showBriefingPersonalizationWarning,
    isBriefingLoading,
    sectionLoading,
    isError: isBriefingError,
    refetch: refreshMarketCaches,
  };
}
