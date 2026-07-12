import "server-only";

import { cache } from "react";

import type { BackendMarketBriefingDto, BackendMarketFreshnessDto, ExchangeCode } from "@/lib/api/backend-api-types";
import type { BackendMarketPulseSummaryDto } from "@/lib/api/market-pulse-api";
import { fetchServerMarketApiNoStore, getServerApiBaseUrl } from "@/lib/api/server-market-api";
import { summaryMatchesFreshness } from "@/lib/market/pulse-generation";

/** Bounded wait for pulse core SSR — must exceed typical cold backend latency (~2–4s locally). */
const PULSE_CORE_LOADER_DEFAULT_MS = 5000;

const parsedPulseLoaderTimeoutMs = Number(process.env.PULSE_CORE_LOADER_TIMEOUT_MS);
export const PULSE_CORE_LOADER_TIMEOUT_MS =
  Number.isFinite(parsedPulseLoaderTimeoutMs) && parsedPulseLoaderTimeoutMs > 0
    ? parsedPulseLoaderTimeoutMs
    : PULSE_CORE_LOADER_DEFAULT_MS;

export type MarketPulseCorePayload = {
  fetchedAt: number;
  lastSyncedAt: string | null;
  freshness: BackendMarketFreshnessDto | null;
  summary: BackendMarketPulseSummaryDto | null;
  briefing: BackendMarketBriefingDto | null;
};

export type MarketPulseCoreLoadResult =
  | { status: "ok"; data: MarketPulseCorePayload }
  | { status: "partial"; data: MarketPulseCorePayload }
  | { status: "error"; message: string };

function buildCorePayload(
  freshness: BackendMarketFreshnessDto | null,
  summary: BackendMarketPulseSummaryDto | null,
  briefing: BackendMarketBriefingDto | null,
): MarketPulseCorePayload {
  const reconciledSummary =
    freshness && summary && summaryMatchesFreshness(summary, freshness) ? summary : null;
  const reconciledBriefing = reconciledSummary && briefing ? briefing : null;

  return {
    fetchedAt: Date.now(),
    lastSyncedAt: freshness?.last_synced_at ?? null,
    freshness,
    summary: reconciledSummary,
    briefing: reconciledBriefing,
  };
}

function resolveCoreStatus(
  freshness: BackendMarketFreshnessDto | null,
  summary: BackendMarketPulseSummaryDto | null,
): MarketPulseCoreLoadResult["status"] {
  if (freshness && summary) {
    return "ok";
  }
  if (freshness || summary) {
    return "partial";
  }
  return "error";
}

async function fetchFreshness(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendMarketFreshnessDto>("/market/freshness", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function fetchPulseSummary(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendMarketPulseSummaryDto>("/market/pulse/summary", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function fetchPulseBriefing(exchange: ExchangeCode, signal: AbortSignal) {
  const result = await fetchServerMarketApiNoStore<BackendMarketBriefingDto | null>("/market/pulse/briefing", {
    params: { exchange },
    signal,
  });
  return result.status === "ok" ? result.data : null;
}

async function loadMarketPulseCoreInternal(exchange: ExchangeCode = "DSE"): Promise<MarketPulseCoreLoadResult> {
  try {
    getServerApiBaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : "SERVER_API_BASE_URL is not configured";
    console.error(`[pulse-ssr] ${message}`);
    return { status: "error", message };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PULSE_CORE_LOADER_TIMEOUT_MS);

  try {
    const [freshnessResult, summaryResult, briefingResult] = await Promise.allSettled([
      fetchFreshness(exchange, controller.signal),
      fetchPulseSummary(exchange, controller.signal),
      fetchPulseBriefing(exchange, controller.signal),
    ]);

    const freshness = freshnessResult.status === "fulfilled" ? freshnessResult.value : null;
    const summaryRaw = summaryResult.status === "fulfilled" ? summaryResult.value : null;
    const briefingRaw = briefingResult.status === "fulfilled" ? briefingResult.value : null;
    const data = buildCorePayload(freshness, summaryRaw, briefingRaw);
    const status = resolveCoreStatus(freshness, data.summary);

    if (status === "error") {
      return { status: "error", message: "Market Pulse core data unavailable" };
    }

    return { status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market Pulse core loader failed";
    console.error(`[pulse-ssr] ${message}`);
    return { status: "error", message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export const loadMarketPulseCore = cache(loadMarketPulseCoreInternal);
