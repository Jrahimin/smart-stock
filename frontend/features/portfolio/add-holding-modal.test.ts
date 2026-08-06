import { describe, expect, it } from "vitest";

import {
  buildAddHoldingPreview,
  isAddHoldingFormValid,
  parsePositiveDecimal,
  resolveExistingWatchlistState,
  resolveSearchPriceStatus,
  selectedStockFromHolding,
  selectedStockFromSearchResult,
  validateAddHoldingForm,
} from "@/features/portfolio/view-models/add-holding-preview";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import type {
  BackendPortfolioHoldingDto,
  BackendStockSearchResultDto,
} from "@/lib/api/backend-api-types";

function holding(overrides: Partial<BackendPortfolioHoldingDto> = {}): BackendPortfolioHoldingDto {
  return {
    watchlist_item_id: "watch-1",
    stock_id: "stock-1",
    is_holding: true,
    symbol: "GP",
    name: "Grameenphone Ltd.",
    exchange: "DSE",
    sector: "Telecommunication",
    quantity: "10.0000",
    average_buy_price: "100.0000",
    note: null,
    current_price: "110.0000",
    previous_close: "108.0000",
    price_change: "2.0000",
    price_change_percent: "1.85",
    price_status: "FINALIZED",
    latest_trade_date: "2026-08-06",
    invested_amount: "1000.00",
    current_value: "1100.00",
    unrealized_gain_amount: "100.00",
    unrealized_gain_percent: "10.00",
    portfolio_weight: "50.00",
    estimated_daily_change_amount: "20.00",
    estimated_daily_contribution_percent: "1.00",
    action: "HOLD",
    holder_action: "HOLD",
    trend: "UPTREND",
    risk: "LOW",
    rsi: "58.00",
    support: "100.0000",
    resistance: "120.0000",
    scanner_conditions: [],
    relevant_event: null,
    decision_reason: "Trend remains constructive.",
    what_next_code: "NO_ACTION_NEEDED",
    requires_attention: false,
    ...overrides,
  };
}

function searchHit(overrides: Partial<BackendStockSearchResultDto> = {}): BackendStockSearchResultDto {
  return {
    id: "stock-1",
    symbol: "GP",
    name: "Grameenphone Ltd.",
    exchange: "DSE",
    sector: "Telecommunication",
    category: "A",
    isin: null,
    listing_date: null,
    lot_size: 1,
    paid_up_capital: null,
    market_cap: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    latest_price: "262.5000",
    latest_trade_date: "2026-08-06",
    data_quality_flag: "OK",
    ...overrides,
  };
}

describe("add holding validation", () => {
  it("requires stock, positive quantity, and positive average buy price", () => {
    expect(validateAddHoldingForm({
      stockId: null,
      quantity: "",
      averageBuyPrice: "-1",
    })).toEqual({
      stock: "required",
      quantity: "required",
      averageBuyPrice: "required",
    });

    expect(isAddHoldingFormValid(validateAddHoldingForm({
      stockId: "stock-1",
      quantity: "10.5",
      averageBuyPrice: "250",
    }))).toBe(true);

    expect(parsePositiveDecimal("0")).toBeNull();
    expect(parsePositiveDecimal("12.5")).toBe(12.5);
  });
});

describe("add holding preview calculations", () => {
  it("computes invested amount, current value, and unrealized P/L outside JSX", () => {
    const preview = buildAddHoldingPreview(10, 100, 110, "FINALIZED");
    expect(preview.investedAmount).toBe(1000);
    expect(preview.currentValue).toBe(1100);
    expect(preview.unrealizedGainAmount).toBe(100);
    expect(preview.unrealizedGainPercent).toBe(10);
    expect(preview.canShowDailyMovement).toBe(true);
  });

  it("keeps stale and unavailable prices visible without daily movement claims", () => {
    const stale = buildAddHoldingPreview(10, 100, 110, "STALE_LAST_KNOWN");
    expect(stale.currentValue).toBe(1100);
    expect(stale.canShowDailyMovement).toBe(false);

    const unavailable = buildAddHoldingPreview(10, 100, null, "UNAVAILABLE");
    expect(unavailable.currentValue).toBeNull();
    expect(unavailable.unrealizedGainAmount).toBeNull();

    expect(resolveSearchPriceStatus(110, "2026-07-01", "OK", "2026-08-06", "FINALIZED")).toBe(
      "STALE_LAST_KNOWN",
    );
    expect(resolveSearchPriceStatus(null, null, null, null, null)).toBe("UNAVAILABLE");
    expect(resolveSearchPriceStatus(110, "2026-08-06", "SUSPICIOUS", "2026-08-06", "FINALIZED")).toBe(
      "SUSPICIOUS",
    );
  });
});

describe("watchlist to holding conversion and existing holding update", () => {
  it("detects watched-only stocks without creating a duplicate holding path", () => {
    const watched = holding({ is_holding: false, quantity: null, average_buy_price: null });
    const state = resolveExistingWatchlistState([watched], "stock-1");
    expect(state.isWatched).toBe(true);
    expect(state.isHolding).toBe(false);

    const held = holding();
    const heldState = resolveExistingWatchlistState([held], "stock-1");
    expect(heldState.isHolding).toBe(true);
    expect(selectedStockFromHolding(held).stockId).toBe("stock-1");
  });

  it("maps autocomplete search hits with latest available price", () => {
    const selected = selectedStockFromSearchResult(searchHit(), "2026-08-06", "FINALIZED");
    expect(selected.symbol).toBe("GP");
    expect(selected.latestPrice).toBe(262.5);
    expect(selected.priceStatus).toBe("FINALIZED");
  });
});

describe("add holding localization", () => {
  it("renders Bangla and English add-holding copy", () => {
    expect(portfolioLanguage.en.addHolding).toBe("Add holding");
    expect(portfolioLanguage.bn.addHolding).toBe("হোল্ডিং যোগ করুন");
    expect(portfolioLanguage.en.addToPortfolio).toBe("Add to portfolio");
    expect(portfolioLanguage.bn.addToPortfolio).toBe("পোর্টফোলিওতে যোগ করুন");
    expect(portfolioLanguage.en.alreadyOnWatchlist).toContain("watchlist");
    expect(portfolioLanguage.bn.alreadyOnWatchlist).toContain("ওয়াচলিস্টে");
  });
});
