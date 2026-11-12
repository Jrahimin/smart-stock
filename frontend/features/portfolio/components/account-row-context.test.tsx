/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AccountDecisionCell, AccountMarketCell } from "./account-row-context";
import { accountRow, accountWatchItem } from "@/test-fixtures/account-fixtures";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import { filterPortfolioHoldings, getPortfolioWhatNextCopy, isPortfolioHoldingIncomplete, isPortfolioReviewRow, portfolioRowComparison } from "@/features/portfolio/view-models/portfolio-view-model";
import { buildWatchlistRowViewModel } from "@/features/watchlist/view-models/watchlist-view-model";

afterEach(cleanup);
it.each(["en", "bn"] as const)("keeps precise holder action/reason before comparison and dated Detail in %s", (locale) => {
  const row = accountRow({ holder_comparison: { status: "CHANGED", previous_action: "HOLD", current_action: "REDUCE", previous_session_date: "2026-11-09" }, public_comparison: { status: "UNCHANGED", previous_action: "SELL", current_action: "SELL", previous_session_date: "2026-11-09" } });
  const { container } = render(<AccountDecisionCell item={row} locale={locale} />);
  const t = portfolioLanguage[locale];
  expect(screen.getByText(t.actionLabels.REDUCE)).toBeTruthy();
  expect(screen.queryByText(t.actionLabels.SELL)).toBeNull();
  expect(container.textContent!.indexOf(t.guidance.REVIEW_SELL_OR_REDUCE)).toBeLessThan(container.textContent!.indexOf(t.comparisonChanged));
  expect(screen.getByRole("link").getAttribute("href")).toContain("TEST");
  expect(container.textContent).toContain("2026-11-10");
});
it.each(["en", "bn"] as const)("renders one dated mark and day change in %s, omits unattributable legacy change", (locale) => {
  const { rerender, container } = render(<AccountMarketCell item={accountRow()} locale={locale} />);
  expect(container.textContent).toContain("৳103"); expect(container.textContent).toContain("+1.98%");
  expect(container.textContent).toContain("2026-11-10"); expect(container.textContent).toContain("Dhaka");
  expect(screen.getByText(portfolioLanguage[locale].previousClose + ": ৳101")).toBeTruthy();
  rerender(<AccountMarketCell item={accountRow({ display_quote: null })} locale={locale} />);
  expect(container.textContent).not.toContain("1.98%"); expect(container.textContent).toContain("৳103");
});
it("separates absent guidance from cost setup and null action from a review signal", () => {
  const row = accountRow({ action: null, holder_action: null, what_next_code: "DATA_INCOMPLETE", requires_attention: false });
  expect(isPortfolioHoldingIncomplete(row)).toBe(false);
  expect(getPortfolioWhatNextCopy(row, portfolioLanguage.en)).toBe(portfolioLanguage.en.signalUnavailable);
  expect(getPortfolioWhatNextCopy({ ...row, quantity: null }, portfolioLanguage.en)).toBe(portfolioLanguage.en.addQuantity);
  expect(isPortfolioReviewRow({ ...row, is_holding: false })).toBe(false);
  const { container } = render(<AccountDecisionCell item={{ ...row, decision_taxonomy_version: "future" }} locale="bn" />);
  expect(container.textContent).toContain(portfolioLanguage.bn.signalUnavailable);
});
it("uses server attention IDs for concentration and other drilldowns while preserving incomplete filter", () => {
  const rows = [accountRow({ stock_id: "a", requires_attention: false }), accountRow({ stock_id: "b", quantity: null, what_next_code: "DATA_INCOMPLETE" })];
  const base = { search: "", action: "ALL", trend: "ALL", selectedStockIds: new Set(["a"]) };
  expect(filterPortfolioHoldings(rows, { ...base, filter: "REVIEW" }).map(r => r.stock_id)).toEqual(["a"]);
  expect(filterPortfolioHoldings(rows, { ...base, selectedStockIds: new Set(["b"]), filter: "INCOMPLETE" }).map(r => r.stock_id)).toEqual(["b"]);
  expect(filterPortfolioHoldings(rows, { ...base, selectedStockIds: null, filter: "HOLDINGS", action: "REDUCE" })).toHaveLength(2);
});
it("never mixes public and holder comparisons or infers a transition from holding toggle", () => {
  const publicPair = { status: "CHANGED" as const, previous_action: "WAIT" as const, current_action: "SELL" as const, previous_session_date: "2026-11-09" };
  expect(portfolioRowComparison(accountRow({ public_comparison: publicPair }))).toBeNull();
  expect(portfolioRowComparison(accountRow({ is_holding: false, public_comparison: publicPair }))).toEqual(publicPair);
  expect(portfolioRowComparison(accountRow({ holder_comparison: { status: "UNCHANGED", current_action: "REDUCE", previous_action: "REDUCE", previous_session_date: "2026-11-09" } }))?.status).toBe("UNCHANGED");
  expect(portfolioRowComparison(accountRow({ holder_comparison: { status: "CHANGED", current_action: "SELL", previous_action: "HOLD", previous_session_date: "2026-11-09" } }))).toBeNull();
});
it("keeps supported legacy mapper price/gain on the account mark and suppresses mixed holder NEW", () => {
  const item = accountWatchItem(); const row = buildWatchlistRowViewModel(item, null);
  expect(row.latestPriceLabel).toBe("103"); expect(row.unrealizedGainLabel).toContain("3"); expect(row.changePercentLabel).toContain("1.98"); expect(row.isNewSignal).toBe(false);
  expect(buildWatchlistRowViewModel({ ...item, display_quote: null }, null).changePercentLabel).toBe("N/A");
});

it.each([["FINALIZED", "চূড়ান্ত দাম"], ["PROVISIONAL", "সাময়িক দাম"], ["SUSPENDED", "লেনদেন স্থগিত"]] as const)("Bangla account mark uses the localized %s price state", (status, label) => {
  const { container } = render(<AccountMarketCell item={accountRow({ price_status: status })} locale="bn" />);
  expect(container.querySelector("summary")?.textContent).toBe(`${label} · 2026-11-10`);
});
