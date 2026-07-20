"use client";

import { Check, CirclePlus, Pencil, X } from "lucide-react";

import type { WatchlistRowViewModel } from "@/features/watchlist/types/watchlist-types";

type WatchlistPriceCellProps = {
  row: WatchlistRowViewModel;
  isEditingBuyPrice: boolean;
  buyPriceDraft: string;
  onBuyPriceDraftChange: (value: string) => void;
  onStartEditBuyPrice: () => void;
  onSaveBuyPrice: () => void;
  onCancelBuyPrice: () => void;
};

export function WatchlistPriceCell({
  row,
  isEditingBuyPrice,
  buyPriceDraft,
  onBuyPriceDraftChange,
  onStartEditBuyPrice,
  onSaveBuyPrice,
  onCancelBuyPrice,
}: WatchlistPriceCellProps) {
  const { item, unrealizedGainLabel } = row;
  const hasBuyPrice = item.buy_price !== null && item.buy_price !== undefined && String(item.buy_price) !== "";

  return (
    <div className="watchlist-price-cell">
      <div className="watchlist-price-stack">
        <strong className="watchlist-market-price">{row.latestPriceLabel}</strong>

        {item.is_holding ? (
          <>
            {isEditingBuyPrice ? (
              <div className="watchlist-buy-price-editor">
                <input
                  autoFocus
                  aria-label="Average buy price"
                  className="watchlist-buy-price-input"
                  onChange={(event) => onBuyPriceDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSaveBuyPrice();
                    }
                    if (event.key === "Escape") {
                      onCancelBuyPrice();
                    }
                  }}
                  placeholder="0.00"
                  type="number"
                  value={buyPriceDraft}
                />
                <button
                  aria-label="Save buy price"
                  className="watchlist-inline-icon-btn watchlist-inline-icon-btn-save"
                  onClick={onSaveBuyPrice}
                  type="button"
                >
                  <Check size={14} />
                </button>
                <button
                  aria-label="Cancel"
                  className="watchlist-inline-icon-btn"
                  onClick={onCancelBuyPrice}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ) : hasBuyPrice ? (
              <div className="watchlist-avg-line">
                <button
                  className="watchlist-avg-trigger"
                  onClick={onStartEditBuyPrice}
                  title="Edit average buy price"
                  type="button"
                >
                  <span className="watchlist-avg-label">Avg</span>
                  <span className="watchlist-avg-value">{row.buyPriceLabel}</span>
                </button>
                <button
                  aria-label="Edit buy price"
                  className="watchlist-buy-price-edit"
                  onClick={onStartEditBuyPrice}
                  type="button"
                >
                  <Pencil size={11} />
                </button>
              </div>
            ) : (
              <button aria-label="Set average buy price" className="watchlist-add-buy-price" onClick={onStartEditBuyPrice} type="button">
                <CirclePlus aria-hidden="true" size={13} />
                <span>Set avg. buy</span>
              </button>
            )}

            {hasBuyPrice && !isEditingBuyPrice && unrealizedGainLabel ? (
              <span
                className={`watchlist-unrealized-pnl ${
                  unrealizedGainLabel.startsWith("-") ? "text-negative" : "text-positive"
                }`}
              >
                {unrealizedGainLabel}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
