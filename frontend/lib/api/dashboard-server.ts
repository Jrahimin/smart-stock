import "server-only";

import { cache } from "react";

import type {
  BackendDashboardMoversDto,
  BackendDashboardOverviewDto,
  BackendDashboardSectorsDto,
  BackendMarketFreshnessDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";
import { fetchServerMarketApiNoStore, getServerApiBaseUrl } from "@/lib/api/server-market-api";

/** Bounded wait for core SSR — must exceed typical cold backend latency (~2–4s locally). */
const parsedCoreLoaderTimeoutMs = Number(process.env.DASHBOARD_CORE_LOADER_TIMEOUT_MS);
export const CORE_LOADER_TIMEOUT_MS =
  Number.isFinite(parsedCoreLoaderTimeoutMs) && parsedCoreLoaderTimeoutMs > 0
    ? parsedCoreLoaderTimeoutMs
    : 5000;

export type DashboardCorePayload = {
  fetchedAt: number;
  lastSyncedAt: string | null;
  overviewLastSyncedAt: string | null;
  freshness: BackendMarketFreshnessDto | null;
  overview: BackendDashboardOverviewDto | null;
  sectors: BackendDashboardSectorsDto | null;
  movers: BackendDashboardMoversDto | null;
};

export type DashboardCoreLoadResult =
  | { status: "ok"; data: DashboardCorePayload }
  | { status: "partial"; data: DashboardCorePayload }
  | { status: "error"; message: string };

type DashboardSessionSection = {
  session_trade_date: string | null;
};

function buildCorePayload(
  freshness: BackendMarketFreshnessDto | null,
  overview: BackendDashboardOverviewDto | null,
  sectors: BackendDashboardSectorsDto | null,
  movers: BackendDashboardMoversDto | null,
): DashboardCorePayload {
  return {
    fetchedAt: Date.now(),
    lastSyncedAt: freshness?.last_synced_at ?? overview?.last_synced_at ?? null,
    overviewLastSyncedAt: overview?.last_synced_at ?? null,
    freshness,
    overview,
    sectors,
    movers,
  };
}

function resolveCoreStatus(
  freshness: BackendMarketFreshnessDto | null,
  overview: BackendDashboardOverviewDto | null,
): DashboardCoreLoadResult["status"] {
  if (freshness && overview) {
    return "ok";
  }
  if (freshness || overview) {
    return "partial";
  }
  return "error";
}

function reconcileOverviewWithFreshness(
  freshness: BackendMarketFreshnessDto | null,
  overview: BackendDashboardOverviewDto | null,
): BackendDashboardOverviewDto | null {
  if (!overview) {
    return null;
  }

  const freshnessSyncedAt = freshness?.last_synced_at ?? null;
  const overviewSyncedAt = overview.last_synced_at ?? null;

  if (freshnessSyncedAt && overviewSyncedAt && freshnessSyncedAt !== overviewSyncedAt) {
    return null;
  }

  return overview;
}

function reconcileDashboardSessionSection<T extends DashboardSessionSection>(
  overview: BackendDashboardOverviewDto | null,
  section: T | null,
): T | null {
  if (!section) {
    return null;
  }

  if (!overview) {
    return null;
  }

  const overviewTradeDate = overview.session_trade_date ?? null;
  const sectionTradeDate = section.session_trade_date ?? null;

  if (overviewTradeDate && sectionTradeDate && overviewTradeDate !== sectionTradeDate) {
    return null;
  }

  return section;
}

async function fetchFreshness(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendMarketFreshnessDto>("/market/freshness", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function fetchOverview(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendDashboardOverviewDto>("/dashboard/overview", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function fetchSectors(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendDashboardSectorsDto>("/dashboard/sectors", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function fetchMovers(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendDashboardMoversDto>("/dashboard/movers", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function loadDashboardCoreInternal(exchange: ExchangeCode = "DSE"): Promise<DashboardCoreLoadResult> {
  try {
    getServerApiBaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : "SERVER_API_BASE_URL is not configured";
    console.error(`[dashboard-ssr] ${message}`);
    return { status: "error", message };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CORE_LOADER_TIMEOUT_MS);

  try {
    const [freshnessResult, overviewResult, sectorsResult, moversResult] = await Promise.allSettled([
      fetchFreshness(exchange, controller.signal),
      fetchOverview(exchange, controller.signal),
      fetchSectors(exchange, controller.signal),
      fetchMovers(exchange, controller.signal),
    ]);

    const freshness =
      freshnessResult.status === "fulfilled" ? freshnessResult.value : null;
    const overviewRaw =
      overviewResult.status === "fulfilled" ? overviewResult.value : null;
    const overview = reconcileOverviewWithFreshness(freshness, overviewRaw);
    const sectorsRaw =
      sectorsResult.status === "fulfilled" ? sectorsResult.value : null;
    const sectors = reconcileDashboardSessionSection(overview, sectorsRaw);
    const moversRaw =
      moversResult.status === "fulfilled" ? moversResult.value : null;
    const movers = reconcileDashboardSessionSection(overview, moversRaw);

    const data = buildCorePayload(freshness, overview, sectors, movers);
    const status = resolveCoreStatus(freshness, overview);

    if (status === "error") {
      return { status: "error", message: "Dashboard core data unavailable" };
    }

    return { status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard core loader failed";
    console.error(`[dashboard-ssr] ${message}`);
    return {
      status: "error",
      message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export const loadDashboardCore = cache(loadDashboardCoreInternal);
