import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { buildMarketDashboardModel } from "@/features/market-dashboard/view-models/market-dashboard-view-model";
import {
  CORE_LOADER_TIMEOUT_MS,
  loadDashboardCore,
} from "@/lib/api/dashboard-server";
import { getServerApiBaseUrl } from "@/lib/api/server-market-api";
import { buildDashboardDehydratedState } from "@/lib/market/build-dashboard-dehydrated-state";
import { syncMarketClientCachesOnBackendUpdate } from "@/lib/market/market-cache-coordinator";
import { isSectionLoading } from "@/lib/ui/section-loading";
import type {
  BackendDashboardMoversDto,
  BackendDashboardOverviewDto,
  BackendDashboardSectorsDto,
  BackendDsexIndexSnapshotDto,
  BackendMarketFreshnessDto,
} from "@/lib/api/backend-api-types";

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

const dsexFixture = {
  trade_date: "2026-07-09",
  index_name: "DSEX",
  market_status: "OPEN",
  index_close: "6250.12",
  index_change: "77.5",
  index_change_percent: "1.25",
  day_open: "6200",
  day_high: "6260",
  day_low: "6190",
  range_52w_low: "5000",
  range_52w_high: "7000",
  range_position_percent: "62.5",
  return_1m_percent: "2.1",
  return_6m_percent: "8.4",
  return_1y_percent: "12.0",
  total_turnover: "1250000000",
  total_volume: 95000000,
  advancing_issues: 120,
  declining_issues: 80,
  unchanged_issues: 45,
} as BackendDsexIndexSnapshotDto;

const overviewFixture = {
  exchange: "DSE",
  session_trade_date: "2026-07-09",
  last_synced_at: "2026-07-09T10:00:00Z",
  listed_stock_count: 400,
  dsex_index: dsexFixture,
  summaries: [
    {
      trade_date: "2026-07-09",
      exchange: "DSE",
      index_name: "DSEX",
      index_close: "6250.12",
      index_change: "77.5",
      index_change_percent: "1.25",
      total_turnover: "1250000000",
      total_volume: 95000000,
      total_trades: 12000,
      advancing_issues: 120,
      declining_issues: 80,
      unchanged_issues: 45,
      data_quality_flag: "VALIDATED",
    },
  ],
} as unknown as BackendDashboardOverviewDto;

const sectorsFixture = {
  session_trade_date: "2026-07-09",
  sectors: [
    { name: "Insurance", change_percent: "3.6", stock_count: 12 },
    { name: "Paper & Printing", change_percent: "3.52", stock_count: 8 },
  ],
  top_gainer: {
    symbol: "ZEALBSA",
    name: "Zeal Bangla Sugar Mills",
    change_percent: "9.99",
  },
} as BackendDashboardSectorsDto;

const moversFixture = {
  session_trade_date: "2026-07-09",
  gainers: [
    {
      stock_id: "00000000-0000-0000-0000-000000000001",
      symbol: "GP",
      name: "Grameenphone",
      exchange: "DSE",
      latest_price: "310.5",
      price_change_percent: "4.2",
      turnover: "1200000",
      volume: 5000,
      trend_direction: "UP",
    },
  ],
  losers: [],
  turnover_leaders: [],
  volume_leaders: [],
} as BackendDashboardMoversDto;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, message: "ok" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("dashboard SSR core model", () => {
  it("builds non-placeholder pulse and breadth from overview-only seed", () => {
    const model = buildMarketDashboardModel(
      overviewFixture.summaries,
      overviewFixture.dsex_index,
      freshnessFixture,
      { listedStockCount: overviewFixture.listed_stock_count },
    );

    expect(model.pulse.indexAvailable).toBe(true);
    expect(model.pulse.indexValue).not.toBe("Awaiting index data");
    expect(model.pulse.latestTradeDate).toBe("2026-07-09");
    expect(model.breadth.advancing).toBe(120);
    expect(model.breadth.declining).toBe(80);
    expect(model.breadth.unchanged).toBe(45);
  });
});

describe("dashboard section loading gates", () => {
  it("does not show pulse or breadth skeleton when overview is seeded", () => {
    expect(isSectionLoading(false, overviewFixture)).toBe(false);
    expect(isSectionLoading(true, overviewFixture)).toBe(false);
  });

  it("shows skeleton only when overview data is undefined", () => {
    expect(isSectionLoading(true, undefined)).toBe(true);
    expect(isSectionLoading(false, undefined)).toBe(false);
  });

  it("does not show leaders skeleton when sectors are seeded", () => {
    expect(isSectionLoading(false, sectorsFixture)).toBe(false);
    expect(isSectionLoading(true, sectorsFixture)).toBe(false);
  });

  it("does not show movers skeleton when movers are seeded", () => {
    expect(isSectionLoading(false, moversFixture)).toBe(false);
    expect(isSectionLoading(true, moversFixture)).toBe(false);
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

  it("uses localhost fallback in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SERVER_API_BASE_URL", "");
    expect(getServerApiBaseUrl()).toBe("http://localhost:8000/api/v1");
  });
});

describe("dashboard SSR dehydrated state", () => {
  it("seeds freshness, overview, sectors, and movers query cache entries", () => {
    const core = {
      fetchedAt: 1_700_000_000_000,
      lastSyncedAt: freshnessFixture.last_synced_at,
      overviewLastSyncedAt: overviewFixture.last_synced_at,
      freshness: freshnessFixture,
      overview: overviewFixture,
      sectors: sectorsFixture,
      movers: moversFixture,
    };

    const dehydrated = buildDashboardDehydratedState(core);
    const freshnessEntry = dehydrated.queries.find((query) =>
      JSON.stringify(query.queryKey) === JSON.stringify(["market-freshness", "DSE"]),
    );
    const overviewEntry = dehydrated.queries.find((query) =>
      JSON.stringify(query.queryKey) === JSON.stringify(["dashboard", "overview", "DSE"]),
    );
    const sectorsEntry = dehydrated.queries.find((query) =>
      JSON.stringify(query.queryKey) === JSON.stringify(["dashboard", "sectors", "DSE"]),
    );
    const moversEntry = dehydrated.queries.find((query) =>
      JSON.stringify(query.queryKey) === JSON.stringify(["dashboard", "movers", "DSE"]),
    );

    expect(freshnessEntry?.state.data).toEqual(freshnessFixture);
    expect(overviewEntry?.state.data).toEqual(overviewFixture);
    expect(sectorsEntry?.state.data).toEqual(sectorsFixture);
    expect(moversEntry?.state.data).toEqual(moversFixture);
    expect(freshnessEntry?.state.dataUpdatedAt).toBe(core.fetchedAt);
    expect(overviewEntry?.state.dataUpdatedAt).toBe(core.fetchedAt);
    expect(sectorsEntry?.state.dataUpdatedAt).toBe(core.fetchedAt);
    expect(moversEntry?.state.dataUpdatedAt).toBe(core.fetchedAt);
  });
});

describe("loadDashboardCore snapshot reconciliation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("SERVER_API_BASE_URL", "http://backend-api:8000/api/v1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("drops overview when last_synced_at disagrees with freshness", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/dashboard/overview")) {
        return jsonResponse({
          ...overviewFixture,
          last_synced_at: "2026-07-09T09:00:00Z",
        });
      }
      if (url.includes("/dashboard/sectors")) {
        return jsonResponse(sectorsFixture);
      }
      if (url.includes("/dashboard/movers")) {
        return jsonResponse(moversFixture);
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("partial");
    if (result.status !== "error") {
      expect(result.data.freshness).not.toBeNull();
      expect(result.data.overview).toBeNull();
      expect(result.data.sectors).toBeNull();
      expect(result.data.movers).toBeNull();
    }
  });
});

describe("loadDashboardCore session section reconciliation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("SERVER_API_BASE_URL", "http://backend-api:8000/api/v1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("drops sectors when session_trade_date disagrees with overview", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/dashboard/overview")) {
        return jsonResponse(overviewFixture);
      }
      if (url.includes("/dashboard/sectors")) {
        return jsonResponse({
          ...sectorsFixture,
          session_trade_date: "2026-07-08",
        });
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("ok");
    if (result.status !== "error") {
      expect(result.data.overview).not.toBeNull();
      expect(result.data.sectors).toBeNull();
    }
  });

  it("drops movers when session_trade_date disagrees with overview", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/dashboard/overview")) {
        return jsonResponse(overviewFixture);
      }
      if (url.includes("/dashboard/sectors")) {
        return jsonResponse(sectorsFixture);
      }
      if (url.includes("/dashboard/movers")) {
        return jsonResponse({
          ...moversFixture,
          session_trade_date: "2026-07-08",
        });
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("ok");
    if (result.status !== "error") {
      expect(result.data.overview).not.toBeNull();
      expect(result.data.movers).toBeNull();
      expect(result.data.sectors).not.toBeNull();
    }
  });
});

describe("loadDashboardCore", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("SERVER_API_BASE_URL", "http://backend-api:8000/api/v1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns partial when one endpoint fails", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      return jsonResponse(null, 500);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("partial");
    if (result.status !== "error") {
      expect(result.data.freshness).not.toBeNull();
      expect(result.data.overview).toBeNull();
      expect(result.data.lastSyncedAt).toBe("2026-07-09T10:00:00Z");
    }
  });

  it("returns ok when both endpoints succeed", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/dashboard/overview")) {
        return jsonResponse(overviewFixture);
      }
      if (url.includes("/dashboard/sectors")) {
        return jsonResponse(sectorsFixture);
      }
      if (url.includes("/dashboard/movers")) {
        return jsonResponse(moversFixture);
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("ok");
    if (result.status !== "error") {
      expect(result.data.freshness).not.toBeNull();
      expect(result.data.overview).not.toBeNull();
      expect(result.data.sectors).not.toBeNull();
      expect(result.data.movers).not.toBeNull();
      expect(result.data.fetchedAt).toBeGreaterThan(0);
    }
  });

  it("returns ok when core endpoints succeed after slow backend latency", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const url = String(input);
      if (url.includes("/market/freshness")) {
        return jsonResponse(freshnessFixture);
      }
      if (url.includes("/dashboard/overview")) {
        return jsonResponse(overviewFixture);
      }
      if (url.includes("/dashboard/sectors")) {
        return jsonResponse(sectorsFixture);
      }
      if (url.includes("/dashboard/movers")) {
        return jsonResponse(moversFixture);
      }
      return jsonResponse(null, 404);
    }) as typeof fetch;

    const result = await loadDashboardCore("DSE");
    expect(result.status).toBe("ok");
    if (result.status !== "error") {
      expect(result.data.overview).not.toBeNull();
      expect(result.data.freshness).not.toBeNull();
      expect(result.data.sectors).not.toBeNull();
      expect(result.data.movers).not.toBeNull();
    }
  }, 10_000);

  it("uses internal backend URL for SSR fetches", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(freshnessFixture));
    global.fetch = fetchMock as typeof fetch;

    await loadDashboardCore("DSE");

    expect(fetchMock).toHaveBeenCalled();
    const firstInput = fetchMock.mock.calls[0]?.[0];
    expect(String(firstInput)).toContain("http://backend-api:8000/api/v1");
  });

  it("uses a core loader timeout that can cover cold backend latency", () => {
    expect(CORE_LOADER_TIMEOUT_MS).toBeGreaterThanOrEqual(3000);
    expect(CORE_LOADER_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
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
