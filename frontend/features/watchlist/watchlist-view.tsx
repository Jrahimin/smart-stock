"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { WorkspacePageHero } from "@/components/layout/workspace-page-hero";
import { MarketActivityLoader } from "@/components/ui/market-activity-loader";
import { SignalBadge } from "@/components/ui/signal-badge";
import { WatchlistPriceCell } from "@/features/watchlist/components/watchlist-price-cell";
import { WatchlistRowActions } from "@/features/watchlist/components/watchlist-row-actions";
import { useUserWatchlist } from "@/features/watchlist/hooks/use-user-watchlist";
import { useWatchlistItemUpdate } from "@/features/watchlist/hooks/use-watchlist-item-update";
import type {
  WatchlistActionFilter,
  WatchlistPageFilters,
  WatchlistRowViewModel,
  WatchlistTrendFilter,
} from "@/features/watchlist/types/watchlist-types";
import {
  buildWatchlistRowViewModel,
  filterWatchlistRows,
  sortWatchlistRows,
} from "@/features/watchlist/view-models/watchlist-view-model";
import { useEnrichedUniverseIntelligence } from "@/hooks/market/use-enriched-universe-intelligence";
import { resolveWatchlistStockIntelligence } from "@/lib/market/universe-intelligence";

export function WatchlistView() {
  const { items, summary, isLoading, isError } = useUserWatchlist();
  const { intelligenceByStockId, isLoading: universeLoading } = useEnrichedUniverseIntelligence({
    stockLimit: 500,
  });
  const updateMutation = useWatchlistItemUpdate();
  const [filters, setFilters] = useState<WatchlistPageFilters>({
    holdings: "ALL",
    action: "ALL",
    trend: "ALL",
  });
  const [editingNoteStockId, setEditingNoteStockId] = useState<string | null>(null);
  const [editingBuyPriceStockId, setEditingBuyPriceStockId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [buyPriceDraft, setBuyPriceDraft] = useState("");

  const rows = useMemo(() => {
    const built = items.map((item) =>
      buildWatchlistRowViewModel(item, resolveWatchlistStockIntelligence(item, intelligenceByStockId)),
    );
    return filterWatchlistRows(sortWatchlistRows(built), filters);
  }, [filters, intelligenceByStockId, items]);

  function openNoteEditor(row: WatchlistRowViewModel) {
    const stockId = row.item.stock_id;
    if (editingNoteStockId === stockId) {
      setEditingNoteStockId(null);
      return;
    }
    setEditingBuyPriceStockId(null);
    setEditingNoteStockId(stockId);
    setNoteDraft(row.item.note ?? "");
  }

  function cancelNote() {
    setEditingNoteStockId(null);
    setNoteDraft("");
  }

  function saveNote(stockId: string) {
    updateMutation.mutate(
      { stockId, payload: { note: noteDraft.trim() || null } },
      { onSuccess: () => cancelNote() },
    );
  }

  function startEditBuyPrice(row: WatchlistRowViewModel) {
    if (!row.item.is_holding) {
      return;
    }
    setEditingNoteStockId(null);
    setEditingBuyPriceStockId(row.item.stock_id);
    setBuyPriceDraft(row.item.buy_price != null ? String(row.item.buy_price) : "");
  }

  function cancelBuyPrice() {
    setEditingBuyPriceStockId(null);
    setBuyPriceDraft("");
  }

  function saveBuyPrice(stockId: string) {
    const trimmed = buyPriceDraft.trim();
    updateMutation.mutate(
      {
        stockId,
        payload: trimmed ? { buy_price: Number(trimmed) } : { buy_price: null },
      },
      { onSuccess: () => cancelBuyPrice() },
    );
  }

  return (
    <section className="watchlist-workspace-view">
      <WorkspacePageHero
        className="watchlist-header"
        eyebrow="Watchlist Intelligence"
        filterContextName="watchlist"
        subtitle={
          <div className="watchlist-stats">
            <span className="watchlist-stat">
              <strong>{summary?.total_watchlisted ?? items.length}</strong> watchlisted
            </span>
            <span className="watchlist-stat">
              <strong>{summary?.total_holdings ?? 0}</strong> holdings
            </span>
            <span className="watchlist-stat">
              Showing <strong>{rows.length}</strong>
            </span>
          </div>
        }
        title="Your tracked market names"
      >
        <div className="explorer-controls watchlist-toolbar-filters" role="toolbar" aria-label="Watchlist filters">
          <button
            aria-pressed={filters.holdings === "HOLDINGS_ONLY"}
            className={`watchlist-holdings-filter-toggle ${
              filters.holdings === "HOLDINGS_ONLY" ? "is-active" : ""
            }`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                holdings: current.holdings === "HOLDINGS_ONLY" ? "ALL" : "HOLDINGS_ONLY",
              }))
            }
            type="button"
          >
            Holding
          </button>
          <label className="watchlist-filter-field">
            <span>Action</span>
            <select
              value={filters.action}
              onChange={(event) =>
                setFilters((current) => ({ ...current, action: event.target.value as WatchlistActionFilter }))
              }
            >
              <option value="ALL">All</option>
              <option value="BUY">BUY</option>
              <option value="HOLD">HOLD</option>
              <option value="WAIT">WAIT</option>
              <option value="SELL">SELL</option>
              <option value="NEW">NEW</option>
            </select>
          </label>
          <label className="watchlist-filter-field">
            <span>Trend</span>
            <select
              value={filters.trend}
              onChange={(event) =>
                setFilters((current) => ({ ...current, trend: event.target.value as WatchlistTrendFilter }))
              }
            >
              <option value="ALL">All</option>
              <option value="BULLISH">Bullish</option>
              <option value="BEARISH">Bearish</option>
              <option value="SIDEWAYS">Sideways</option>
            </select>
          </label>
        </div>
      </WorkspacePageHero>

      {isError ? <div className="data-warning">Could not load your watchlist.</div> : null}
      {isLoading || universeLoading ? <MarketActivityLoader /> : null}

      <div className="watchlist-table-shell stock-table-shell">
        <div className="watchlist-table" role="table">
          <div className="watchlist-table-head" role="rowgroup">
            <div className="watchlist-row watchlist-header-row" role="row">
              <div className="watchlist-cell watchlist-actions-header" role="columnheader">
                Operations
              </div>
              <div className="watchlist-cell watchlist-symbol-header" role="columnheader">
                Symbol
              </div>
              <div className="watchlist-cell watchlist-price-header" role="columnheader">
                Price
              </div>
              <div className="watchlist-cell watchlist-numeric-header" role="columnheader">
                Change
              </div>
              <div className="watchlist-cell watchlist-action-signal-header" role="columnheader">
                Action
              </div>
              <div className="watchlist-cell watchlist-numeric-header" role="columnheader">
                RSI
              </div>
              <div className="watchlist-cell watchlist-trend-header" role="columnheader">
                Trend
              </div>
              <div className="watchlist-cell watchlist-updated-header" role="columnheader">
                Updated
              </div>
            </div>
          </div>
          <div className="watchlist-table-body" role="rowgroup">
            {rows.length ? (
              rows.map((row, rowIndex) => {
                const stock = row.intelligence?.stock;
                const href = stock ? `/stocks/${stock.exchange}/${stock.symbol}` : "#";
                const stockId = row.item.stock_id;
                const isNoteEditing = editingNoteStockId === stockId;
                const isEditingBuyPrice = editingBuyPriceStockId === stockId;
                const changePositive = (row.intelligence?.priceChangePercent ?? 0) >= 0;

                return (
                  <div
                    className={`watchlist-row ${rowIndex % 2 === 0 ? "is-alt" : ""}`}
                    key={row.item.id}
                    role="row"
                  >
                    <div className="watchlist-cell watchlist-actions-cell" role="cell">
                      <WatchlistRowActions
                        hasNote={row.item.has_note}
                        isHolding={row.item.is_holding}
                        isNoteEditing={isNoteEditing}
                        noteDraft={noteDraft}
                        onCancelNote={cancelNote}
                        onNoteDraftChange={setNoteDraft}
                        onSaveNote={() => saveNote(stockId)}
                        onToggleNote={() => openNoteEditor(row)}
                        stockId={stockId}
                      />
                    </div>
                    <div className="watchlist-cell watchlist-symbol-cell" role="cell">
                      <Link className="watchlist-symbol-link" href={href}>
                        <strong>{row.item.stock_symbol}</strong>
                        <span>{row.companyName}</span>
                      </Link>
                      <div className="watchlist-symbol-meta">
                        <small>
                          {row.item.watching_label}
                          {row.item.is_holding ? " • Holding" : ""}
                        </small>
                      </div>
                    </div>
                    <div className="watchlist-cell watchlist-price-column" role="cell">
                      <WatchlistPriceCell
                        buyPriceDraft={buyPriceDraft}
                        isEditingBuyPrice={isEditingBuyPrice}
                        onBuyPriceDraftChange={setBuyPriceDraft}
                        onCancelBuyPrice={cancelBuyPrice}
                        onSaveBuyPrice={() => saveBuyPrice(stockId)}
                        onStartEditBuyPrice={() => startEditBuyPrice(row)}
                        row={row}
                      />
                    </div>
                    <div
                      className={`watchlist-cell watchlist-numeric-cell ${changePositive ? "text-positive" : "text-negative"}`}
                      role="cell"
                    >
                      {row.changePercentLabel}
                    </div>
                    <div className="watchlist-cell watchlist-action-signal-cell" role="cell">
                      <div className="watchlist-action-badges">
                        <SignalBadge signal={row.actionLabel} />
                        {row.isNewSignal ? (
                          <span
                            className="watchlist-badge watchlist-badge-new"
                            title={
                              row.previousActionLabel
                                ? `Decision changed this session: ${row.previousActionLabel} → ${row.actionLabel}`
                                : "Decision changed this session"
                            }
                          >
                            NEW
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="watchlist-cell watchlist-numeric-cell" role="cell">
                      {row.rsiLabel}
                    </div>
                    <div className="watchlist-cell watchlist-trend-cell" role="cell">
                      <span className={`watchlist-trend-badge watchlist-trend-${row.trendTone}`}>{row.trendLabel}</span>
                    </div>
                    <div className="watchlist-cell watchlist-updated-cell" role="cell">
                      {row.lastUpdatedLabel}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="watchlist-empty-row" role="row">
                <div className="watchlist-empty-cell" role="cell">
                  <div className="empty-state empty-state-premium">
                    <strong>No watchlist names match these filters</strong>
                    <span>Add stocks from the explorer or scanner using the star control.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
