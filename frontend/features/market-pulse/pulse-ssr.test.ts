import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { buildMarketPulseViewModel } from "@/features/market-pulse/view-models/market-pulse-view-model";
import {
  resolveMarketPulseBriefing,
  resolveMarketPulseBriefingFlags,
  resolveMarketPulsePresentationFlags,
  resolveMarketPulseSummary,
  shouldInvalidatePulseSsrSeed,
  shouldWriteMarketPulseSnapshot,
} from "@/features/market-pulse/lib/market-pulse-query-state";
import {
  loadMarketPulseCore,
  PULSE_CORE_LOADER_TIMEOUT_MS,
  type MarketPulseCorePayload,
} from "@/lib/api/pulse-server";
import { getServerApiBaseUrl } from "@/lib/api/server-market-api";
import type { BackendMarketBriefingDto, BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
import type { BackendMarketPulseSummaryDto } from "@/lib/api/market-pulse-api";
import { buildPulseDehydratedState } from "@/lib/market/build-pulse-dehydrated-state";
import { summaryMatchesFreshness } from "@/lib/market/pulse-generation";
import { syncMarketClientCachesOnBackendUpdate } from "@/lib/market/market-cache-coordinator";
import {
  buildPulseBriefingQueryKey,
  buildPulseSummaryQueryKey,
  buildPreviousSnapshotFingerprint,
  normalizeDisplayName,
  PULSE_ANONYMOUS_BRIEFING_QUERY_KEY,
  PULSE_ANONYMOUS_SUMMARY_QUERY_KEY,
} from "@/lib/market/pulse-query-keys";
import { isSectionLoading } from "@/lib/ui/section-loading";

const freshnessFixture = {
  exchange: "DSE",
  trade_date: "2026-07-09",
  market_status: "OPEN",
  last_synced_at: "2026-07-09T10:00:00Z",
  next_sync_at: "2026-07-09T10:15:00Z",
  dashboard_cache_ttl_seconds: 600,
  snapshot_interval_minutes: 15,
  market_sync_interval_seconds: 900,
  expected_delay_minutes: 15,
  market_open_time: "10:00",
  market_close_time: "15:00",
  freshness_label: "Fresh",
} as BackendMarketFreshnessDto;

const summaryFixture = {
  hero: {
    greeting: "Good morning",
    attention_headline: "3 stocks need attention",
    attention_subline: "Markets are active today",
    last_updated_label: "Updated 10:00 AM",
    relative_updated_label: "5 minutes ago",
    session_label: "OPEN",
    focus_count: 3,
    recent_focus_count: 1,
  },
  since_last_visit: {
    visible: false,
    new_changes_count: 0,
    new_focus_count: 0,
    new_alerts_count: 0,
    summary_label: "",
  },
  focus_stocks: [
    {
      rank: 1,
      stock_id: "00000000-0000-0000-0000-000000000001",
      symbol: "GP",
      name: "Grameenphone",
      exchange: "DSE",
      pulse_score: 82,
      score_breakdown: {
        trend: 30,
        momentum: 25,
        volume: 20,
        signal_boost: 5,
        risk_penalty: 0,
        total: 82,
        contributors: [],
        band: "strong",
      },
      focus_label: "Momentum Building",
      label_tone: "positive",
      why_here: ["Strong volume"],
      trigger: "Breakout above resistance",
      action_summary: "Watch for continuation",
      recommendation: "BUY",
      latest_price: "310.5",
      price_change_percent: "+4.2%",
      price_tone: "positive",
      sparkline_points: [1, 2, 3],
    },
  ],
  monitor_candidates: [],
  alerts: [],
  empty_state: "ready",
  empty_message: null,
  data_quality_note: null,
  last_synced_at: "2026-07-09T10:00:00Z",
} as unknown as BackendMarketPulseSummaryDto;

const briefingFixture = {
  story: {
    headline: "MIXED MARKET WITH SELECTIVE ROTATION",
    explanation: "Participation is selective.",
    tone: "neutral",
    metrics: [],
  },
  state: {
    dimensions: [],
    overall_label: "Selective Opportunity",
    overall_tone: "info",
  },
  money_flow: { inflows: [], outflows: [] },
  opportunity_score: {
    score: 98,
    label: "Above Average Opportunity Environment",
    history: [47, 48, 55, 56, 98],
    previous_session: 56,
    weekly_average: 61,
    trend_label: "Improving",
  },
  playbook: { question: "What to watch?", items: [] },
  high_priority: null,
  leadership: {
    cards: [],
    fresh_buy_signals: 0,
    narrative: "",
    fresh_new_count: 0,
    fresh_upgraded_count: 0,
  },
  summary: {
    text: "Market remains selective.",
    tone: "neutral",
    highlights: [],
    trading_environment: null,
  },
} as unknown as BackendMarketBriefingDto;

const personalizedSummaryFixture = {
  ...summaryFixture,
  hero: {
    ...summaryFixture.hero,
    attention_headline: "Personalized headline",
  },
} as BackendMarketPulseSummaryDto;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, message: "ok" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pulse generation identity", () => {
  it("requires matching last_synced_at before hydration or snapshot writes", () => {
    expect(summaryMatchesFreshness(summaryFixture, freshnessFixture)).toBe(true);
    expect(
      summaryMatchesFreshness(
        { ...summaryFixture, last_synced_at: "2026-07-09T09:00:00Z" },
        freshnessFixture,
      ),
    ).toBe(false);
    expect(summaryMatchesFreshness({ ...summaryFixture, last_synced_at: null }, freshnessFixture)).toBe(
      false,
    );
    expect(summaryMatchesFreshness(summaryFixture, { ...freshnessFixture, last_synced_at: null })).toBe(
      false,
    );
  });
});

describe("pulse SSR dehydrated state", () => {
  it("seeds freshness and anonymous summary only", () => {
    const core: MarketPulseCorePayload = {
      fetchedAt: 1_700_000_000_000,
      lastSyncedAt: freshnessFixture.last_synced_at,
      freshness: freshnessFixture,
      summary: summaryFixture,
    };

    const dehydrated = buildPulseDehydratedState(core);
    const freshnessEntry = dehydrated.queries.find(
      (query) => JSON.stringify(query.queryKey) === JSON.stringify(["market-freshness", "DSE"]),
    );
    const summaryEntry = dehydrated.queries.find(
      (query) => JSON.stringify(query.queryKey) === JSON.stringify(PULSE_ANONYMOUS_SUMMARY_QUERY_KEY),
    );
    const briefingEntry = dehydrated.queries.find(
      (query) => JSON.stringify(query.queryKey) === JSON.stringify(PULSE_ANONYMOUS_BRIEFING_QUERY_KEY),
    );

    expect(freshnessEntry?.state.data).toEqual(freshnessFixture);
    expect(summaryEntry?.state.data).toEqual(summaryFixture);
    expect(briefingEntry).toBeUndefined();
  });
});

describe("loadMarketPulseCore", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("SERVER_API_BASE_URL", "http://backend-api:8000/api/v1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not request briefing during SSR", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/market/pulse/summary")) {
        return jsonResponse(summaryFixture);
      }
      return jsonResponse(null, 404);
    });
    global.fetch = fetchMock as typeof fetch;

    await loadMarketPulseCore("DSE");

    const requestedUrls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(requestedUrls.some((url) => url.includes("/market/pulse/briefing"))).toBe(false);
    expect(requestedUrls.some((url) => url.includes("/market/pulse/summary"))).toBe(true);
  });

  it("drops summary when generation disagrees with freshness", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/market/pulse/summary")) {
        return jsonResponse({
          ...summaryFixture,
          last_synced_at: "2026-07-09T09:00:00Z",
        });
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadMarketPulseCore("DSE");
    expect(result.status).toBe("partial");
    if (result.status !== "error") {
      expect(result.data.freshness).not.toBeNull();
      expect(result.data.summary).toBeNull();
    }
  });

  it("returns ok when freshness and matching summary succeed", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/market/pulse/summary")) {
        return jsonResponse(summaryFixture);
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadMarketPulseCore("DSE");
    expect(result.status).toBe("ok");
    if (result.status !== "error") {
      expect(result.data.summary).toEqual(summaryFixture);
      expect(result.data.fetchedAt).toBeGreaterThan(0);
    }
  });

  it("uses the dedicated pulse SSR timeout default", () => {
    expect(PULSE_CORE_LOADER_TIMEOUT_MS).toBe(1500);
  });
});

describe("market pulse query orchestration", () => {
  const initialCore: MarketPulseCorePayload = {
    fetchedAt: 1_700_000_000_000,
    lastSyncedAt: freshnessFixture.last_synced_at,
    freshness: freshnessFixture,
    summary: summaryFixture,
  };

  it("keeps resolved summary visible during personalized refetch", () => {
    const duringFetch = resolveMarketPulseSummary(
      initialCore,
      {
        data: summaryFixture,
        isLoading: false,
        isSuccess: true,
        isError: false,
        isFetching: false,
      },
      {
        data: undefined,
        isLoading: true,
        isSuccess: false,
        isError: false,
        isFetching: true,
      },
      freshnessFixture.last_synced_at,
    );

    expect(duringFetch.resolvedSummary).toEqual(summaryFixture);
  });

  it("does not hydrate seeded summary when generation mismatches freshness", () => {
    const mismatchedCore: MarketPulseCorePayload = {
      ...initialCore,
      summary: { ...summaryFixture, last_synced_at: "2026-07-09T09:00:00Z" },
    };

    const resolved = resolveMarketPulseSummary(
      mismatchedCore,
      { data: undefined, isLoading: true, isSuccess: false, isError: false, isFetching: true },
      { data: undefined, isLoading: false, isSuccess: false, isError: false, isFetching: false },
      freshnessFixture.last_synced_at,
    );

    expect(resolved.anonymousSummary).toBeNull();
    expect(resolved.resolvedSummary).toBeNull();
  });

  it("keeps anonymous summary when personalized summary is stale", () => {
    const stalePersonalized = {
      ...summaryFixture,
      last_synced_at: "2026-07-09T09:00:00Z",
      hero: { ...summaryFixture.hero, greeting: "Good morning, Alex" },
    };

    const resolved = resolveMarketPulseSummary(
      initialCore,
      {
        data: summaryFixture,
        isLoading: false,
        isSuccess: true,
        isError: false,
        isFetching: false,
      },
      {
        data: stalePersonalized,
        isLoading: false,
        isSuccess: true,
        isError: false,
        isFetching: false,
      },
      freshnessFixture.last_synced_at,
    );

    expect(resolved.resolvedSummary).toEqual(summaryFixture);
  });

  it("does not hydrate summary when freshness is missing", () => {
    const resolved = resolveMarketPulseSummary(
      initialCore,
      { data: undefined, isLoading: true, isSuccess: false, isError: false, isFetching: true },
      { data: undefined, isLoading: false, isSuccess: false, isError: false, isFetching: false },
      null,
    );

    expect(resolved.resolvedSummary).toEqual(summaryFixture);
  });

  it("shows personalization warning and keeps anonymous model on personalized failure", () => {
    const flags = resolveMarketPulsePresentationFlags(
      summaryFixture,
      summaryFixture,
      { isLoading: false, isSuccess: true, isError: false, isFetching: false },
      { isError: true, isFetching: false, data: undefined },
      freshnessFixture.last_synced_at,
    );

    expect(flags.showPersonalizationWarning).toBe(true);
    expect(flags.showFullPageLoader).toBe(false);
  });

  it("shows loader instead of unavailable when anonymous summary lacks generation identity", () => {
    const staleSummary = { ...summaryFixture, last_synced_at: null } as BackendMarketPulseSummaryDto;
    const flags = resolveMarketPulsePresentationFlags(
      staleSummary,
      null,
      { isLoading: false, isSuccess: true, isError: false, isFetching: false },
      { isError: false, isFetching: false, data: undefined },
      freshnessFixture.last_synced_at,
    );

    expect(flags.showFullPageLoader).toBe(true);
    expect(flags.showUnavailable).toBe(false);
  });

  it("does not write snapshot when personalized request fails", () => {
    expect(
      shouldWriteMarketPulseSnapshot({
        hasPersonalizationInputs: true,
        anonymousSettled: true,
        anonymousSummary: summaryFixture,
        personalizedSummaryQuerySuccess: false,
        personalizedSummary: null,
        lastSyncedAt: freshnessFixture.last_synced_at,
        resolvedSummary: summaryFixture,
      }),
    ).toBe(false);
  });

  it("does not write snapshot when freshness advanced beyond summary generation", () => {
    expect(
      shouldWriteMarketPulseSnapshot({
        hasPersonalizationInputs: false,
        anonymousSettled: true,
        anonymousSummary: summaryFixture,
        personalizedSummaryQuerySuccess: false,
        personalizedSummary: null,
        lastSyncedAt: "2026-07-09T11:00:00Z",
        resolvedSummary: summaryFixture,
      }),
    ).toBe(false);
  });

  it("writes snapshot only when summary generation matches freshness", () => {
    expect(
      shouldWriteMarketPulseSnapshot({
        hasPersonalizationInputs: false,
        anonymousSettled: true,
        anonymousSummary: summaryFixture,
        personalizedSummaryQuerySuccess: false,
        personalizedSummary: null,
        lastSyncedAt: freshnessFixture.last_synced_at,
        resolvedSummary: summaryFixture,
      }),
    ).toBe(true);
  });

  it("shows non-blocking briefing personalization warning on personalized briefing failure", () => {
    const flags = resolveMarketPulseBriefingFlags(
      briefingFixture,
      { isLoading: false, isError: false },
      { isError: true, data: undefined },
      briefingFixture,
    );

    expect(flags.showBriefingPersonalizationWarning).toBe(true);
    expect(flags.isBriefingLoading).toBe(false);
  });

  it("keeps anonymous briefing visible during personalized briefing refetch", () => {
    const resolved = resolveMarketPulseBriefing(
      {
        data: briefingFixture,
        isLoading: false,
        isSuccess: true,
        isError: false,
      },
      {
        data: undefined,
        isLoading: true,
        isSuccess: false,
        isError: false,
      },
    );

    expect(resolved.resolvedBriefing).toEqual(briefingFixture);
  });
});

describe("pulse query keys", () => {
  it("builds anonymous summary and briefing keys", () => {
    expect(PULSE_ANONYMOUS_SUMMARY_QUERY_KEY).toEqual(["market-pulse-summary", "DSE", null, null]);
    expect(PULSE_ANONYMOUS_BRIEFING_QUERY_KEY).toEqual(["market-pulse-briefing", "DSE", null]);
    expect(buildPulseBriefingQueryKey({ displayName: "Alex" })).toEqual([
      "market-pulse-briefing",
      "DSE",
      "Alex",
    ]);
    expect(normalizeDisplayName("")).toBeNull();
    const snapshot = {
      last_synced_at: "2026-07-08T10:00:00Z",
      focus_stock_ids: ["a", "b"],
      scores: { a: 1 },
      recommendations: { a: "BUY" },
      alert_ids: ["x"],
    };
    expect(buildPreviousSnapshotFingerprint(snapshot)).toContain("2026-07-08T10:00:00Z");
    expect(buildPulseSummaryQueryKey({ previousSnapshot: snapshot })[3]).toBe(
      buildPreviousSnapshotFingerprint(snapshot),
    );
  });
});

describe("pulse section loading gates", () => {
  it("does not show focus skeleton when summary is seeded", () => {
    expect(isSectionLoading(false, summaryFixture)).toBe(false);
    expect(isSectionLoading(true, summaryFixture)).toBe(false);
  });
});

describe("getServerApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws in production when SERVER_API_BASE_URL is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVER_API_BASE_URL", "");
    expect(() => getServerApiBaseUrl()).toThrow(/SERVER_API_BASE_URL is required/);
  });
});

describe("PulseSsrHydrationGuard policy", () => {
  it("invalidates at most once on freshness mismatch", () => {
    const initialCore: MarketPulseCorePayload = {
      fetchedAt: 1_700_000_000_000,
      lastSyncedAt: "2026-07-09T09:00:00Z",
      freshness: freshnessFixture,
      summary: summaryFixture,
    };

    expect(shouldInvalidatePulseSsrSeed(initialCore, "2026-07-09T10:00:00Z", false)).toBe(true);
    expect(shouldInvalidatePulseSsrSeed(initialCore, "2026-07-09T10:00:00Z", true)).toBe(false);
  });
});

describe("SSR hydration coordinator policy", () => {
  it("syncMarketClientCachesOnBackendUpdate clears market IndexedDB before TanStack invalidation", async () => {
    const clearMarketSpy = vi.spyOn(
      await import("@/lib/api/backend-api-client"),
      "clearMarketBackendApiCache",
    ).mockResolvedValue();
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: invalidateSpy,
    } as unknown as import("@tanstack/react-query").QueryClient;

    await syncMarketClientCachesOnBackendUpdate(queryClient);

    expect(clearMarketSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
