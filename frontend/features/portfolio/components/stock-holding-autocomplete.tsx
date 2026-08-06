"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import type { AddHoldingModalController } from "@/features/portfolio/hooks/use-add-holding-modal";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import { formatPortfolioMoney } from "@/features/portfolio/view-models/portfolio-view-model";
import type { AppLocale } from "@/lib/locale/app-locale";

type StockHoldingAutocompleteProps = {
  locale: AppLocale;
  controller: AddHoldingModalController;
  disabled?: boolean;
};

export function StockHoldingAutocomplete({
  locale,
  controller,
  disabled = false,
}: StockHoldingAutocompleteProps) {
  const t = portfolioLanguage[locale];
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    query,
    setQuery,
    selectedStock,
    stockLocked,
    clearSelectedStock,
    selectSearchResult,
    searchResults,
    isSearching,
    isSearchEnabled,
    searchError,
    activeOptionIndex,
    setActiveOptionIndex,
    showValidation,
    validation,
  } = controller;

  useEffect(() => {
    if (!disabled && !stockLocked) {
      inputRef.current?.focus();
    }
  }, [disabled, stockLocked]);

  const showMenu = !stockLocked && isSearchEnabled;
  const optionCount = searchResults.length;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showMenu) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveOptionIndex((index) => {
        if (optionCount === 0) return -1;
        return index < 0 ? 0 : (index + 1) % optionCount;
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveOptionIndex((index) => {
        if (optionCount === 0) return -1;
        return index <= 0 ? optionCount - 1 : index - 1;
      });
      return;
    }
    if (event.key === "Enter" && activeOptionIndex >= 0 && searchResults[activeOptionIndex]) {
      event.preventDefault();
      selectSearchResult(searchResults[activeOptionIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveOptionIndex(-1);
    }
  };

  return (
    <div className="add-holding-autocomplete">
      <label className="add-holding-label" htmlFor="add-holding-stock">
        {t.stock}
      </label>
      <div className="add-holding-search-wrap">
        <div className={`add-holding-search ${showValidation && validation.stock ? "has-error" : ""}`}>
          <Search size={15} />
          <input
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={showMenu}
            aria-invalid={showValidation && Boolean(validation.stock)}
            autoComplete="off"
            disabled={disabled || stockLocked}
            id="add-holding-stock"
            onChange={(event) => {
              if (stockLocked) return;
              setQuery(event.target.value);
              setActiveOptionIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder={t.stockSearchPlaceholder}
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          {stockLocked && selectedStock && !disabled ? (
            <button className="add-holding-clear-stock" onClick={clearSelectedStock} type="button">
              {t.edit}
            </button>
          ) : null}
        </div>

        {showMenu ? (
          <div
            aria-label={t.stock}
            className="add-holding-search-menu"
            id={listboxId}
            role="listbox"
          >
            {isSearching ? (
              <div className="add-holding-search-state">
                <Loader2 className="is-spinning" size={14} />
                {t.stockSearchLoading}
              </div>
            ) : null}
            {searchError ? (
              <div className="add-holding-search-state is-error">{t.stockSearchError}</div>
            ) : null}
            {!isSearching && !searchError && searchResults.length === 0 ? (
              <div className="add-holding-search-state">{t.stockSearchEmpty}</div>
            ) : null}
            {!searchError
              ? searchResults.map((stock, index) => (
                <button
                  aria-selected={activeOptionIndex === index}
                  className={`add-holding-search-option ${activeOptionIndex === index ? "is-active" : ""}`}
                  key={stock.id}
                  onClick={() => selectSearchResult(stock)}
                  onMouseEnter={() => setActiveOptionIndex(index)}
                  role="option"
                  type="button"
                >
                  <strong>{stock.symbol}</strong>
                  <span>{stock.name}</span>
                </button>
              ))
              : null}
          </div>
        ) : null}
      </div>

      {showValidation && validation.stock ? (
        <p className="add-holding-field-error">{t.stockRequired}</p>
      ) : null}

      {selectedStock && stockLocked ? (
        <div className="add-holding-selected-stock">
          <strong>{selectedStock.symbol}</strong>
          <span>{selectedStock.name}</span>
          <small>
            {selectedStock.latestPrice != null
              ? formatPortfolioMoney(selectedStock.latestPrice, locale)
              : t.previewPriceUnavailable}
          </small>
        </div>
      ) : null}
    </div>
  );
}
