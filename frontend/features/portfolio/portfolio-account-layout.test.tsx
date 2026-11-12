/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PortfolioWorkspaceView } from "./portfolio-workspace-view";
import { accountRow, accountWorkspace } from "@/test-fixtures/account-fixtures";
import { portfolioLanguage } from "./portfolio-language";
const state = vi.hoisted(() => ({ compact: false, data: {} as unknown, update: vi.fn(), remove: vi.fn() }));
vi.mock("@/features/auth/context/auth-context", () => ({ useAuth: () => ({ user: { id: "user-a" }, isAuthenticated: true }) }));
vi.mock("@/features/portfolio/hooks/use-portfolio-workspace", () => ({ usePortfolioWorkspace: () => ({ data: state.data, isPending: false, isError: false }), resolvePortfolioWorkspaceLoadState: () => "ready" }));
vi.mock("@/features/portfolio/hooks/use-portfolio-compact-layout", () => ({ usePortfolioCompactLayout: () => state.compact }));
vi.mock("@/features/portfolio/hooks/use-portfolio-email-preference", () => ({ usePortfolioEmailPreference: () => ({ enabled: false, ready: true, saving: false, toggle: vi.fn() }) }));
vi.mock("@/features/portfolio/hooks/use-add-holding-modal", () => ({ useAddHoldingModal: () => ({ isOpen: false, highlightedStockId: null, openCreate: vi.fn() }) }));
vi.mock("@/features/portfolio/components/add-holding-modal", () => ({ AddHoldingModal: () => null }));
vi.mock("@/components/layout/market-data-freshness-bar", () => ({ MarketDataFreshnessBar: () => null }));
vi.mock("@/features/market-dashboard/components/dashboard-locale-switcher", () => ({ DashboardLocaleSwitcher: () => null }));
vi.mock("@/lib/api/watchlist-api", () => ({ updateWatchlistItem: (...args: unknown[]) => state.update(...args), removeWatchlistItem: (...args: unknown[]) => state.remove(...args) }));
function mount(locale: "en" | "bn") { const client = new QueryClient(); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return render(<PortfolioWorkspaceView locale={locale} />, { wrapper }); }
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); state.compact = false; state.data = accountWorkspace(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each([[false, "en"], [true, "en"], [false, "bn"], [true, "bn"]] as const)("same server account money and precise instruction in compact=%s %s", (compact, locale) => {
  state.compact = compact; const { container } = mount(locale);
  expect(container.textContent).toContain("৳103"); expect(container.textContent).toContain("+1.98%"); expect(container.textContent).toContain("+3.00%"); expect(container.textContent).toContain("2026-11-10");
  expect(container.textContent).toContain(portfolioLanguage[locale].actionLabels.REDUCE);
  expect(container.querySelectorAll(".portfolio-account-decision")).toHaveLength(1);
});
it("attention click displays server-selected names even with no row-level review flag", () => {
  const a = accountRow({ stock_id: "a", symbol: "AAA", requires_attention: false }); const b = accountRow({ stock_id: "b", symbol: "BBB", requires_attention: false });
  const data = accountWorkspace(a); data.watchlist_items = [a, b, accountRow({ stock_id: "c", symbol: "CCC", requires_attention: false })]; data.holdings = data.watchlist_items;
  data.attention = [{ code: "HIGH_CONCENTRATION", severity: "MEDIUM", stock_ids: ["a", "b"], symbols: ["AAA", "BBB"], count: 2 }]; state.data = data;
  const { container } = mount("en"); fireEvent.click(screen.getByRole("button", { name: /High position concentration/ }));
  expect([...container.querySelectorAll("tr[data-stock-id]")].map(row => row.getAttribute("data-stock-id"))).toEqual(["a", "b"]);
});
it("fractional average-cost edit preserves four-decimal input and keeps money confirmed while pending", async () => {
  const row = accountRow({ average_buy_price: "20.1760", quantity: "50", current_price: "20.8", current_value: "1040", unrealized_gain_amount: "31.20", unrealized_gain_percent: "3.09" }); state.data = accountWorkspace(row);
  let finish!: (value: unknown) => void; state.update.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { container } = mount("en"); fireEvent.click(screen.getByText("৳20.176"));
  const input = screen.getByRole("spinbutton", { name: "Average Buy price" }) as HTMLInputElement; expect(input.value).toBe("20.1760");
  fireEvent.change(input, { target: { value: "20.1234" } }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(state.update).toHaveBeenCalledWith("stock-1", { buy_price: 20.1234 }));
  expect(container.textContent).toContain("+3.09%"); expect(container.textContent).toContain("৳1,040"); expect(container.textContent).toContain(portfolioLanguage.en.pendingValues);
  await act(async () => { finish({}); });
});

it.each([[false, "en"], [true, "en"], [false, "bn"], [true, "bn"]] as const)("known value is independent of missing cost in compact=%s %s", (compact, locale) => {
  state.compact = compact; const row = accountRow({ average_buy_price: null, current_value: "1030", invested_amount: null, unrealized_gain_amount: null, unrealized_gain_percent: null, what_next_code: "DATA_INCOMPLETE" });
  const data = accountWorkspace(row); data.pulse.invested_amount_is_complete = false; data.pulse.unrealized_gain_is_complete = false; state.data = data;
  const { container } = mount(locale); const record = container.querySelector(compact ? "article[data-stock-id]" : "tr[data-stock-id]")!;
  expect(record.textContent).toContain("৳1,030"); expect(record.textContent).not.toContain("+3.00%"); expect(record.textContent).toContain(portfolioLanguage[locale].addAveragePrice);
  expect(container.textContent).toContain(portfolioLanguage[locale].coverage(1, 1));
});
it.each([false, true])("missing marked value is unavailable and coverage is zero (compact=%s)", (compact) => {
  state.compact = compact; const data = accountWorkspace(accountRow({ current_price: null, current_value: null, display_quote: null, price_status: "UNAVAILABLE", unrealized_gain_amount: null, unrealized_gain_percent: null }));
  data.pulse.current_value_is_complete = false; data.pulse.valued_holding_count = 0; state.data = data;
  const { container } = mount("en"); const record = container.querySelector(compact ? "article[data-stock-id]" : "tr[data-stock-id]")!;
  expect(record.textContent).not.toContain("৳1,030"); expect(container.textContent).toContain(portfolioLanguage.en.coverage(0, 1));
});
it.each(["en", "bn"] as const)("holder counts, filter and neutral-risk Review reason agree (%s)", (locale) => {
  const data = accountWorkspace(); const actions = ["REVIEW", "REDUCE", "SELL", null] as const;
  data.watchlist_items = actions.map((action, index) => accountRow({ stock_id: `s${index}`, symbol: `S${index}`, holder_action: action, action: action === "REVIEW" ? "WAIT" : action ? "SELL" : null, requires_attention: action === "REVIEW", primary_reason_code: "illiquid", what_next_code: action === "REVIEW" ? "REVIEW_HOLDER_GUIDANCE" : "NO_ACTION_NEEDED", risk: "LOW" }));
  data.holdings = data.watchlist_items; data.holder_review_attention = { code: "HOLDER_REVIEW", severity: "MEDIUM", stock_ids: ["s0"], symbols: ["S0"], count: 1 }; data.shape.action_groups = [{ action: "WAIT", count: 1, current_value: "1030" }, { action: "SELL", count: 2, current_value: "2060" }];
  data.shape.holder_action_groups = actions.map(holder_action => ({ holder_action, count: 1, current_value: "1030" })); state.data = data;
  const { container } = mount(locale); const groups = container.querySelector(".portfolio-action-group-list")!;
  for (const action of actions) expect(groups.textContent).toContain(action ? portfolioLanguage[locale].actionLabels[action] : portfolioLanguage[locale].signalUnavailable);
  expect(container.querySelector('tr[data-stock-id="s0"]')?.textContent).not.toContain(portfolioLanguage[locale].guidance.NO_ACTION_NEEDED);
  expect(screen.getByRole("button", { name: new RegExp(portfolioLanguage[locale].attentionLabels.HOLDER_REVIEW) })).toBeTruthy();
  const actionSelect = screen.getByRole("combobox", { name: portfolioLanguage[locale].action }); fireEvent.change(actionSelect, { target: { value: "REVIEW" } });
  expect([...container.querySelectorAll("tr[data-stock-id]")].map(row => row.getAttribute("data-stock-id"))).toEqual(["s0"]);
});
it.each(["en", "bn"] as const)("daily contribution has percentage-point units and comparable portfolio basis (%s)", (locale) => {
  const data = accountWorkspace(); data.shape.worst_daily_contributor = { stock_id: "spcl", symbol: "SPCL", name: "Fixture", amount: "-20", percent: "-0.48" }; state.data = data;
  const { container, unmount } = mount(locale); const tile = [...container.querySelectorAll(".portfolio-insight-tile")].find(item => item.textContent?.includes(portfolioLanguage[locale].lowestDailyContribution))!;
  expect(tile.textContent).toContain(`-0.48 ${portfolioLanguage[locale].percentagePoints}`); expect(tile.textContent).toContain(portfolioLanguage[locale].dailyContributionBasis); expect(tile.textContent).not.toContain("risk");
  unmount(); data.shape.worst_daily_contributor = { stock_id: "good", symbol: "GOOD", name: "Fixture", amount: "20", percent: "0.25" }; state.data = data;
  const positive = mount(locale); const positiveTile = [...positive.container.querySelectorAll(".portfolio-insight-tile")].find(item => item.textContent?.includes(portfolioLanguage[locale].lowestDailyContribution))!;
  expect(positiveTile.className).toContain("is-positive"); expect(positiveTile.textContent).toContain(`+0.25 ${portfolioLanguage[locale].percentagePoints}`);
});
it("unavailable daily comparisons do not fall back to a since-cost position under the daily label", () => {
  const data = accountWorkspace(); data.shape.worst_daily_contributor = null; data.shape.weakest_position = { stock_id: "w", symbol: "WEAK", name: "Fixture", amount: "-100", percent: "-10" }; state.data = data;
  const { container } = mount("en"); expect(container.textContent).not.toContain(portfolioLanguage.en.lowestDailyContribution); expect(container.textContent).not.toContain(portfolioLanguage.en.highestRisk);
});
it("suggestions retain the account price and omit legacy or unusable unattributed day change", () => {
  const data = accountWorkspace(); data.watchlist_to_review = [{ stock_id: "idea", symbol: "IDEA", name: "Fixture", exchange: "DSE", sector: null, current_price: "103", price_change_percent: "99", action: "WAIT", trend: "UNKNOWN", risk: null, reason_code: "SUPPORT_REBOUND", scanner_condition: "SUPPORT_REBOUND", relevant_event: null, display_quote: { current_price: 0, observation_status: "UNAVAILABLE", price_change_percent: -100 } }]; state.data = data;
  const { container, rerender } = mount("en"); let card = container.querySelector(".portfolio-idea")!; expect(card.textContent).toContain("৳103"); expect(card.textContent).not.toContain("99%"); expect(card.textContent).not.toContain("100%");
  data.watchlist_to_review[0] = { ...data.watchlist_to_review[0], display_quote: accountRow().display_quote, price_status: "FINALIZED", price_change_percent: "1.98" }; state.data = { ...data }; rerender(<PortfolioWorkspaceView locale="en" />);
  card = container.querySelector(".portfolio-idea")!; expect(card.textContent).toContain("৳103"); expect(card.textContent).toContain("+1.98%");
});

it("strongest/weakest since-cost tone follows the actual signed return", () => {
  const data = accountWorkspace(); data.shape.strongest_position = { stock_id: "loss", symbol: "LOSS", name: "Fixture", percent: "-1", amount: "-10" }; data.shape.weakest_position = { stock_id: "gain", symbol: "GAIN", name: "Fixture", percent: "2", amount: "20" }; state.data = data;
  const { container } = mount("en"); const tiles = [...container.querySelectorAll(".portfolio-insight-tile")];
  expect(tiles.find(tile => tile.textContent?.includes("LOSS"))?.className).toContain("is-negative"); expect(tiles.find(tile => tile.textContent?.includes("GAIN"))?.className).toContain("is-positive");
});

it("a legacy mismatched suggestion quote cannot relabel the account mark with its date or daily change", () => {
  const data = accountWorkspace(); data.watchlist_to_review = [{ stock_id: "legacy", symbol: "LEGACY", name: "Fixture", exchange: "DSE", sector: null, current_price: "100", price_change_percent: "99", action: "WAIT", trend: "UNKNOWN", risk: null, reason_code: "IMPORTANT_EVENT", scanner_condition: null, relevant_event: null, price_status: "FINALIZED", display_quote: { current_price: 110, observation_status: "FINALIZED", as_of_trade_date: "2026-12-31", observation_session_date: "2026-12-31", price_change_percent: 10 } }]; state.data = data;
  const { container } = mount("en"); const card = container.querySelector(".portfolio-idea")!;
  expect(card.textContent).toContain("৳100"); expect(card.textContent).not.toContain("2026-12-31"); expect(card.textContent).not.toContain("10.00%"); expect(card.textContent).not.toContain("99.00%");
});

it.each(["en", "bn"] as const)("suggestion action shares the localized account action label (%s)", (locale) => {
  const data = accountWorkspace(); data.watchlist_to_review = [{ stock_id: "localized", symbol: "LOCALE", name: "Fixture", exchange: "DSE", sector: null, current_price: "103", price_change_percent: "1.98", display_quote: accountRow().display_quote, price_status: "FINALIZED", action: "WAIT", trend: "UNKNOWN", risk: null, reason_code: "SUPPORT_REBOUND", scanner_condition: "SUPPORT_REBOUND", relevant_event: null }]; state.data = data;
  const { container } = mount(locale); expect(container.querySelector(".portfolio-idea .portfolio-status")?.textContent).toBe(portfolioLanguage[locale].actionLabels.WAIT);
  if (locale === "bn") expect(container.querySelector(".portfolio-idea .portfolio-status")?.textContent).toBe("অপেক্ষা করুন");
});

it.each(["en", "bn"] as const)("compact priority preview preserves every attention drilldown and visible partial coverage (%s)", (locale) => {
  const data = accountWorkspace();
  data.attention = [{ code: "IMPORTANT_EVENT", severity: "INFO", stock_ids: ["stock-1"], symbols: ["EVENT"], count: 1 },
    { code: "ELEVATED_RISK", severity: "HIGH", stock_ids: ["stock-1"], symbols: ["RISK"], count: 1 }];
  data.holder_review_attention = { code: "HOLDER_REVIEW", severity: "MEDIUM", stock_ids: ["stock-1"], symbols: ["REVIEW"], count: 1 };
  data.pulse.unrealized_gain_is_complete = false; state.data = data;
  const { container } = mount(locale); const list = container.querySelector(".portfolio-attention-list")!;
  expect(list.textContent).toContain(portfolioLanguage[locale].attentionLabels.ELEVATED_RISK);
  expect(list.textContent).toContain(portfolioLanguage[locale].attentionLabels.HOLDER_REVIEW);
  expect(list.textContent).not.toContain(portfolioLanguage[locale].attentionLabels.IMPORTANT_EVENT);
  expect(container.querySelector(".portfolio-partial-flag")?.textContent).toBe(portfolioLanguage[locale].partialAccount);
  fireEvent.click(screen.getByRole("button", { name: portfolioLanguage[locale].valueCoverage }));
  expect(screen.getByRole("dialog").textContent).toContain(portfolioLanguage[locale].partialPL);
  fireEvent.click(screen.getByRole("button", { name: locale === "bn" ? "বন্ধ করুন" : "Close" }));
  const expand = container.querySelector<HTMLButtonElement>(".portfolio-attention footer button, .portfolio-attention-more, .portfolio-attention .portfolio-text-button");
  expect(expand).not.toBeNull(); fireEvent.click(expand!);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(portfolioLanguage[locale].attentionLabels.IMPORTANT_EVENT) }));
  expect(container.querySelector('tr[data-stock-id="stock-1"]')).not.toBeNull();
});
