"use client";

import { useEffect, useMemo } from "react";

import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import { useMarketCacheRefresh } from "@/hooks/market/use-market-cache-coordinator";
import { mapDashboardMoversDto } from "@/features/market-dashboard/view-models/dashboard-movers-mapper";
import {
  mapDashboardAlertsDto,
  mapDashboardHeatmapDto,
  mapDashboardSectorsToLeadersContext,
  mapDashboardSentimentDto,
} from "@/features/market-dashboard/view-models/dashboard-sections-mapper";
import { useDashboardHeatmap } from "@/features/market-dashboard/hooks/use-dashboard-heatmap";
import { useDashboardMarketAlerts } from "@/features/market-dashboard/hooks/use-dashboard-market-alerts";
import { useDashboardMarketSentiment } from "@/features/market-dashboard/hooks/use-dashboard-market-sentiment";
import { useDashboardMovers } from "@/features/market-dashboard/hooks/use-dashboard-movers";
import { useDashboardOverview } from "@/features/market-dashboard/hooks/use-dashboard-overview";
import { useDashboardSectors } from "@/features/market-dashboard/hooks/use-dashboard-sectors";
import { useDashboardStocksInFocus } from "@/features/market-dashboard/hooks/use-dashboard-stocks-in-focus";
import { setMarketPersistentCacheTtlMs } from "@/lib/api/backend-api-client";
import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import {
  getDashboardRefetchIntervalMs,
  getDashboardStaleTimeMs,
} from "@/lib/market/market-cache-policy";
import { isSectionLoading } from "@/lib/ui/section-loading";

function isSectionAwaitingData<T>(
  data: T | undefined,
  isLoading: boolean,
  enabled: boolean,
): boolean {
  if (!enabled) {
    return false;
  }

  return data === undefined && isLoading;
}

export function useMarketDashboard(options?: {
  initialCore?: DashboardCorePayload | null;
  locale?: AppLocale;
}) {
  const initialCore = options?.initialCore ?? null;
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const refreshMarketCaches = useMarketCacheRefresh();
  const freshnessQuery = useMarketDataFreshness("DSE", {
    initialData: initialCore?.freshness ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });
  const freshness = freshnessQuery.data;
  const dashboardCacheTtlSeconds = freshness?.dashboard_cache_ttl_seconds ?? null;
  const marketStatus = freshness?.market_status;
  const snapshotIntervalMinutes = freshness?.snapshot_interval_minutes ?? null;

  useEffect(() => {
    if (dashboardCacheTtlSeconds == null) {
      return;
    }
    setMarketPersistentCacheTtlMs(dashboardCacheTtlSeconds * 1000);
  }, [dashboardCacheTtlSeconds]);

  const staleTimeMs = useMemo(
    () => getDashboardStaleTimeMs(freshness),
    [dashboardCacheTtlSeconds],
  );
  const refetchIntervalMs = useMemo(
    () => getDashboardRefetchIntervalMs(freshness),
    [dashboardCacheTtlSeconds, marketStatus, snapshotIntervalMinutes],
  );

  const overviewQuery = useDashboardOverview({
    staleTimeMs,
    refetchIntervalMs,
    initialData: initialCore?.overview ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });
  const overviewReady = Boolean(overviewQuery.data);
  const moversQuery = useDashboardMovers({
    staleTimeMs,
    refetchIntervalMs,
    enabled: overviewReady,
    initialData: initialCore?.movers ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });
  const sectorsQuery = useDashboardSectors({
    staleTimeMs,
    refetchIntervalMs,
    initialData: initialCore?.sectors ?? undefined,
    initialDataUpdatedAt: initialCore?.fetchedAt,
  });
  const signalsQuery = useDashboardStocksInFocus({
    staleTimeMs,
    refetchIntervalMs,
    enabled: overviewReady,
  });
  const alertsQuery = useDashboardMarketAlerts({
    staleTimeMs,
    refetchIntervalMs,
    enabled: overviewReady,
  });
  const heatmapQuery = useDashboardHeatmap({
    staleTimeMs,
    refetchIntervalMs,
    enabled: overviewReady,
  });
  const sentimentQuery = useDashboardMarketSentiment({
    staleTimeMs,
    refetchIntervalMs,
    enabled: overviewReady,
  });

  const mappedMovers = useMemo(
    () => (moversQuery.data ? mapDashboardMoversDto(moversQuery.data) : undefined),
    [moversQuery.data],
  );
  const mappedSignals = useMemo(
    () => signalsQuery.data?.signals,
    [signalsQuery.data],
  );
  const mappedTimeline = useMemo(
    () => (alertsQuery.data ? mapDashboardAlertsDto(alertsQuery.data) : undefined),
    [alertsQuery.data],
  );
  const mappedHeatmap = useMemo(
    () => (heatmapQuery.data ? mapDashboardHeatmapDto(heatmapQuery.data) : undefined),
    [heatmapQuery.data],
  );
  const mappedSentiment = useMemo(
    () => (sentimentQuery.data ? mapDashboardSentimentDto(sentimentQuery.data) : undefined),
    [sentimentQuery.data],
  );
  const mappedLeadersContext = useMemo(
    () => (sectorsQuery.data ? mapDashboardSectorsToLeadersContext(sectorsQuery.data) : undefined),
    [sectorsQuery.data],
  );

  const model = useMemo(
    () =>
      buildMarketDashboardModel(
        overviewQuery.data?.summaries ?? [],
        overviewQuery.data?.dsex_index ?? null,
        freshness ?? null,
        {
          listedStockCount: overviewQuery.data?.listed_stock_count,
          movers: mappedMovers,
          heatmapTiles: mappedHeatmap,
          signals: mappedSignals,
          timeline: mappedTimeline,
          insights: mappedSentiment?.insights,
          leadersContext: mappedLeadersContext,
          marketMood: mappedSentiment?.marketMood,
          priceBackedCount: mappedSentiment?.priceBackedCount ?? signalsQuery.data?.evaluatedCount,
          turnoverLabel: mappedSentiment?.turnoverLabel,
          locale,
        },
      ),
    [
      overviewQuery.data,
      freshness?.trade_date,
      freshness?.market_status,
      freshness?.freshness_label,
      mappedMovers,
      mappedHeatmap,
      mappedSignals,
      mappedTimeline,
      mappedSentiment,
      mappedLeadersContext,
      signalsQuery.data?.evaluatedCount,
      locale,
    ],
  );

  const sectionLoading = {
    pulseCore: isSectionLoading(overviewQuery.isLoading, overviewQuery.data),
    leaders: isSectionLoading(sectorsQuery.isLoading, sectorsQuery.data),
    pulse:
      isSectionLoading(overviewQuery.isLoading, overviewQuery.data) ||
      (overviewQuery.data !== undefined && isSectionLoading(sectorsQuery.isLoading, sectorsQuery.data)),
    breadth: isSectionLoading(overviewQuery.isLoading, overviewQuery.data),
    movers: isSectionLoading(moversQuery.isLoading, moversQuery.data),
    signals: isSectionAwaitingData(signalsQuery.data, signalsQuery.isLoading, overviewReady),
    timeline: isSectionLoading(alertsQuery.isLoading, alertsQuery.data),
    heatmap: isSectionLoading(heatmapQuery.isLoading, heatmapQuery.data),
    insights: isSectionLoading(sentimentQuery.isLoading, sentimentQuery.data),
  };

  const isCoreLoading =
    sectionLoading.pulseCore ||
    sectionLoading.movers ||
    sectionLoading.signals ||
    sectionLoading.timeline;

  return {
    model,
    sectionLoading,
    isLoading: isCoreLoading,
    isDeferredLoading: sectionLoading.heatmap || sectionLoading.insights,
    signalsSectionError: signalsQuery.isError,
    signalsSectionWarmingUp: signalsQuery.isWarmingUp,
    isError:
      overviewQuery.isError ||
      moversQuery.isError ||
      sectorsQuery.isError ||
      alertsQuery.isError ||
      heatmapQuery.isError ||
      sentimentQuery.isError,
    priceBackedCount: mappedSentiment?.priceBackedCount ?? signalsQuery.data?.evaluatedCount ?? 0,
    refetch: refreshMarketCaches,
  };
}
