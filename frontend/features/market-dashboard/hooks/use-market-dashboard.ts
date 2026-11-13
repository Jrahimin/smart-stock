"use client";

import { useEffect, useMemo } from "react";
import { freshnessGenerationToken } from "@/lib/market/market-generation";
import { dashboardSectorGenerationToken, dashboardSectorsMatchFreshness } from "@/lib/market/dashboard-sector-generation";

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
import { shouldUseDashboardInitialData, dashboardSectionMatchesOverview } from "./dashboard-query-key";

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
  const generation = freshness?.market_sync_id ?? freshness?.last_synced_at ?? null;
  const sectorGeneration = dashboardSectorGenerationToken(freshness);
  const initialGeneration =
    initialCore?.freshness?.market_sync_id ?? initialCore?.freshness?.last_synced_at ?? null;
  const canUseInitialData = shouldUseDashboardInitialData(initialGeneration, generation);
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
    generation: generation ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null,
    initialData: canUseInitialData ? initialCore?.overview ?? undefined : undefined,
    initialDataUpdatedAt: canUseInitialData ? initialCore?.fetchedAt : undefined,
  });
  const overviewReady = Boolean(overviewQuery.data);
  const moversQuery = useDashboardMovers({
    generation: generation ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null && overviewReady,
    initialData: canUseInitialData ? initialCore?.movers ?? undefined : undefined,
    initialDataUpdatedAt: canUseInitialData ? initialCore?.fetchedAt : undefined,
  });
  const sectorsQuery = useDashboardSectors({
    generation: sectorGeneration ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null,
    initialData: canUseInitialData && dashboardSectorsMatchFreshness(initialCore?.sectors, freshness) ? initialCore?.sectors ?? undefined : undefined,
    initialDataUpdatedAt: canUseInitialData ? initialCore?.fetchedAt : undefined,
  });
  const signalsQuery = useDashboardStocksInFocus({
    generation: freshnessGenerationToken(freshness) ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null && overviewReady,
  });
  const alertsQuery = useDashboardMarketAlerts({
    generation: generation ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null && overviewReady,
  });
  const heatmapQuery = useDashboardHeatmap({
    generation: generation ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null && overviewReady,
  });
  const sentimentQuery = useDashboardMarketSentiment({
    generation: generation ?? "pending",
    staleTimeMs,
    refetchIntervalMs,
    enabled: generation !== null && overviewReady,
  });

  const mappedMovers = useMemo(
    () => (moversQuery.data && dashboardSectionMatchesOverview(overviewQuery.data, moversQuery.data) ? mapDashboardMoversDto(moversQuery.data) : undefined),
    [moversQuery.data, overviewQuery.data?.market_sync_id],
  );
  const mappedSignals = useMemo(
    () => signalsQuery.data?.signals,
    [signalsQuery.data],
  );
  const mappedTimeline = useMemo(
    () => (alertsQuery.data && dashboardSectionMatchesOverview(overviewQuery.data, alertsQuery.data) ? mapDashboardAlertsDto(alertsQuery.data) : undefined),
    [alertsQuery.data, overviewQuery.data?.market_sync_id],
  );
  const mappedHeatmap = useMemo(
    () => (heatmapQuery.data && dashboardSectionMatchesOverview(overviewQuery.data, heatmapQuery.data) ? mapDashboardHeatmapDto(heatmapQuery.data) : undefined),
    [heatmapQuery.data, overviewQuery.data?.market_sync_id],
  );
  const mappedSentiment = useMemo(
    () => {
      if (!sentimentQuery.data) return undefined;
      const mapped = mapDashboardSentimentDto(sentimentQuery.data);
      // A current HTTP body can land under an older query key. Join delivered
      // section identities before any sentiment-derived field reaches the model.
      return dashboardSectionMatchesOverview(overviewQuery.data, sentimentQuery.data) ? mapped : undefined;
    },
    [sentimentQuery.data, overviewQuery.data?.market_sync_id],
  );
  const mappedLeadersContext = useMemo(
    () => (sectorsQuery.data && !freshnessQuery.isError && dashboardSectorsMatchFreshness(sectorsQuery.data, freshness)
      && dashboardSectionMatchesOverview(overviewQuery.data, sectorsQuery.data) ? mapDashboardSectorsToLeadersContext(sectorsQuery.data) : undefined),
    [sectorsQuery.data, overviewQuery.data?.market_sync_id, sectorGeneration, freshnessQuery.isError],
  );

  const model = useMemo(
    () =>
      buildMarketDashboardModel(
        overviewQuery.data?.summaries ?? [],
        overviewQuery.data?.dsex_index ?? null,
        freshness ?? null,
        {
          overview: overviewQuery.data,
          breadth: overviewQuery.data?.breadth,
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
    freshness,
    freshnessLoading: freshnessQuery.isLoading,
    timelineError: alertsQuery.isError,
    insightsError: sentimentQuery.isError,
    sectionLoading,
    isLoading: isCoreLoading,
    isDeferredLoading: sectionLoading.heatmap || sectionLoading.insights,
    signalsSectionError: signalsQuery.isError,
    signalsSectionWarmingUp: signalsQuery.isWarmingUp,
    signalsPublication: signalsQuery.data?.decisionPublication ??
      (freshness?.decision_status === "UNAVAILABLE" ? freshness : undefined),
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
