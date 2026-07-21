import { describe, expect, it } from "vitest";

import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import {
  filterPortfolioHoldings,
  formatPortfolioMoney,
} from "@/features/portfolio/view-models/portfolio-view-model";
import type {
  BackendPortfolioHoldingDto,
  PortfolioAttentionCode,
  PortfolioWhatNextCode,
} from "@/lib/api/backend-api-types";

const guidanceCodes: PortfolioWhatNextCode[] = [
  "DATA_INCOMPLETE",
  "PRICE_STALE_OR_SUSPENDED",
  "REVIEW_SUPPORT_BREAK",
  "REVIEW_SELL_OR_REDUCE",
  "REVIEW_ELEVATED_RISK",
  "DO_NOT_AVERAGE_DOWN_FOR_COST_ONLY",
  "WATCH_RESISTANCE",
  "PROFITABLE_TREND_INTACT",
  "NO_ACTION_NEEDED",
];

const attentionCodes: PortfolioAttentionCode[] = [
  "SUPPORT_BREAK",
  "SELL_OR_REDUCE",
  "PRICE_QUALITY",
  "ELEVATED_RISK",
  "INCOMPLETE_HOLDING",
  "HIGH_CONCENTRATION",
  "WATCH_RESISTANCE",
  "UNUSUAL_VOLUME",
  "IMPORTANT_EVENT",
];

function holding(
  stockId: string,
  overrides: Partial<BackendPortfolioHoldingDto> = {},
): BackendPortfolioHoldingDto {
  return {
    watchlist_item_id: `watch-${stockId}`,
    stock_id: stockId,
    is_holding: true,
    symbol: stockId.toUpperCase(),
    name: `${stockId} Limited`,
    exchange: "DSE",
    sector: null,
    quantity: "10.0000",
    average_buy_price: "100.0000",
    note: null,
    current_price: "110.0000",
    previous_close: "108.0000",
    price_change: "2.0000",
    price_change_percent: "1.85",
    price_status: "FINALIZED",
    latest_trade_date: "2026-07-20",
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

describe("portfolio localization", () => {
  it("covers every semantic guidance and attention code in both languages", () => {
    for (const locale of ["en", "bn"] as const) {
      for (const code of guidanceCodes) expect(portfolioLanguage[locale].guidance[code]).toBeTruthy();
      for (const code of attentionCodes) expect(portfolioLanguage[locale].attentionLabels[code]).toBeTruthy();
    }
  });

  it("uses the taka marker while preserving Western financial digits", () => {
    expect(formatPortfolioMoney("1234.50", "bn")).toBe("৳1,234.5");
    expect(formatPortfolioMoney("-7200", "en")).toBe("-৳7,200");
  });
});

describe("portfolio holding filters", () => {
  const rows = [
    holding("gp"),
    holding("brac", {
      requires_attention: true,
      what_next_code: "REVIEW_SUPPORT_BREAK",
      trend: "DOWNTREND",
      action: "SELL",
    }),
    holding("squr", {
      quantity: null,
      requires_attention: true,
      what_next_code: "DATA_INCOMPLETE",
    }),
  ];

  it("filters attention-selected and incomplete positions deterministically", () => {
    expect(filterPortfolioHoldings(rows, {
      search: "",
      filter: "REVIEW",
      action: "ALL",
      trend: "ALL",
      selectedStockIds: null,
    }).map((row) => row.stock_id)).toEqual(["brac", "squr"]);

    expect(filterPortfolioHoldings(rows, {
      search: "",
      filter: "INCOMPLETE",
      action: "ALL",
      trend: "ALL",
      selectedStockIds: new Set(["squr"]),
    }).map((row) => row.stock_id)).toEqual(["squr"]);
  });

  it("keeps reviewed holdings ahead of stable holdings and watchlist-only rows", () => {
    const unified = [
      holding("watch", { is_holding: false, action: "POTENTIAL_BUY", requires_attention: false }),
      holding("stable"),
      holding("review", { requires_attention: true, what_next_code: "REVIEW_ELEVATED_RISK" }),
    ];
    expect(filterPortfolioHoldings(unified, {
      search: "", filter: "ALL", action: "ALL", trend: "ALL", selectedStockIds: null,
    }).map((row) => row.stock_id)).toEqual(["review", "stable", "watch"]);
  });

  it("orders incomplete holdings after review rows inside a group", () => {
    const unified = [
      holding("stable"),
      holding("incomplete", { quantity: null, what_next_code: "DATA_INCOMPLETE", requires_attention: true }),
      holding("review", { requires_attention: true, what_next_code: "REVIEW_SUPPORT_BREAK" }),
    ];
    expect(filterPortfolioHoldings(unified, {
      search: "", filter: "ALL", action: "ALL", trend: "ALL", selectedStockIds: null,
    }).map((row) => row.stock_id)).toEqual(["review", "incomplete", "stable"]);
  });
});
